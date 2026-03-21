import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Youtube, Share2, Users, Play, Pause, X, Music, Copy, Check, Link, ArrowRight, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

interface SyncedUser {
  user_id: string;
  display_name: string;
  avatar: string;
}

interface YouTubeSyncProps {
  className?: string;
}

const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
    /(?:youtu\.be\/)([^?\s]+)/,
    /(?:youtube\.com\/embed\/)([^?\s]+)/,
    /(?:youtube\.com\/shorts\/)([^?\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const extractPlaylistId = (url: string): string | null => {
  const match = url.match(/[?&]list=([^&\s]+)/);
  return match ? match[1] : null;
};

const extractPlaylistUrl = (url: string): string | null => {
  const match = url.match(/[?&]list=([^&\s]+)/);
  if (match) {
    return `https://youtube.com/playlist?list=${match[1]}`;
  }
  return null;
};

// Load YouTube IFrame API once globally
let ytApiLoaded = false;
let ytApiLoadPromise: Promise<void> | null = null;
const loadYouTubeApi = (): Promise<void> => {
  if (ytApiLoaded) return Promise.resolve();
  if (ytApiLoadPromise) return ytApiLoadPromise;
  ytApiLoadPromise = new Promise((resolve) => {
    if ((window as any).YT && (window as any).YT.Player) {
      ytApiLoaded = true;
      resolve();
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      resolve();
    };
  });
  return ytApiLoadPromise;
};

// Casting-quality sync constants
const DRIFT_THRESHOLD = 0.2;
const HEARTBEAT_INTERVAL = 800;

export const YouTubeSync = ({ className }: YouTubeSyncProps) => {
  const { user, currentRoom, profile, joinRoom, refreshRooms } = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [sharedBy, setSharedBy] = useState<string>("");
  const [syncedUsers, setSyncedUsers] = useState<SyncedUser[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playlistCopied, setPlaylistCopied] = useState(false);
  const [lastPlaylistUrl, setLastPlaylistUrl] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const isHostRef = useRef(false);
  // Guard to prevent broadcast feedback loops when we programmatically control the player
  const ignoreBroadcastRef = useRef(false);
  // Track the host's authoritative timestamp for continuous correction
  const lastHostSyncRef = useRef<{ time: number; hostTime: number; rate: number } | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Keep isHostRef in sync
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // Initialize YouTube player when video becomes active
  useEffect(() => {
    if (!activeVideoId || !playerContainerRef.current) return;

    let destroyed = false;
    const initPlayer = async () => {
      await loadYouTubeApi();
      if (destroyed || !isMountedRef.current) return;

      // Destroy previous player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      const isPlaylistOnly = activeVideoId.startsWith('playlist-');
      const playerVars: Record<string, any> = {
        autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1,
        disablekb: isHostRef.current ? 0 : 1,
        controls: isHostRef.current ? 1 : 0,
      };
      if (activePlaylistId) {
        playerVars.listType = 'playlist';
        playerVars.list = activePlaylistId;
      }

      const playerConfig: Record<string, any> = {
        playerVars,
        events: {
          onReady: (event: any) => {
            // Ensure listeners start playing immediately
            if (!isHostRef.current) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: any) => {
            if (!isMountedRef.current || ignoreBroadcastRef.current) return;
            // Only host broadcasts state changes
            if (!isHostRef.current) return;
            const state = event.data;
            const YT = (window as any).YT.PlayerState;

            if (state === YT.PAUSED) {
              setIsPaused(true);
              broadcastPlaybackState("paused", event.target.getCurrentTime(), event.target.getPlaybackRate());
            } else if (state === YT.PLAYING) {
              setIsPaused(false);
              broadcastPlaybackState("playing", event.target.getCurrentTime(), event.target.getPlaybackRate());
            }
          },
          onPlaybackRateChange: (event: any) => {
            if (!isMountedRef.current || ignoreBroadcastRef.current || !isHostRef.current) return;
            broadcastPlaybackState("speed", event.target.getCurrentTime(), event.data);
          },
        },
      };
      if (!isPlaylistOnly) {
        playerConfig.videoId = activeVideoId;
      }

      playerRef.current = new (window as any).YT.Player(playerContainerRef.current, playerConfig);
    };

    initPlayer();
    return () => {
      destroyed = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, [activeVideoId]);

  // Host heartbeat: periodically broadcast current position so listeners can correct drift
  useEffect(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    if (!isHost || !activeVideoId) return;

    heartbeatRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;
      const YT = (window as any).YT?.PlayerState;
      if (!YT) return;
      const state = player.getPlayerState();
      if (state === YT.PLAYING) {
        broadcastPlaybackState("heartbeat", player.getCurrentTime(), player.getPlaybackRate());
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [isHost, activeVideoId]);

  // Listener-side continuous drift correction between heartbeats
  useEffect(() => {
    if (isHost || !activeVideoId) return;

    const correctionInterval = setInterval(() => {
      const player = playerRef.current;
      const sync = lastHostSyncRef.current;
      if (!player || !sync || typeof player.getCurrentTime !== "function") return;
      const YT = (window as any).YT?.PlayerState;
      if (!YT || player.getPlayerState() !== YT.PLAYING) return;

      // Calculate where the host should be now based on last sync + elapsed time
      const elapsed = (Date.now() - sync.time) / 1000;
      const expectedTime = sync.hostTime + elapsed * sync.rate;
      const actualTime = player.getCurrentTime();
      const drift = Math.abs(expectedTime - actualTime);

      if (drift > DRIFT_THRESHOLD) {
        ignoreBroadcastRef.current = true;
        player.seekTo(expectedTime, true);
        setTimeout(() => { ignoreBroadcastRef.current = false; }, 200);
      }
    }, 1000);

    return () => clearInterval(correctionInterval);
  }, [isHost, activeVideoId]);

  const broadcastPlaybackState = useCallback((action: string, currentTime: number, rate?: number) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "youtube_playback",
      payload: { action, currentTime, rate, sender_id: user?.id, timestamp: Date.now() },
    }).catch((err: any) => console.error("Failed to broadcast playback:", err));
  }, [user?.id]);

  useEffect(() => {
    if (!currentRoom?.id || !user || !profile) return;

    const setupChannel = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase.channel(`youtube-sync-${currentRoom.id}`, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      channel
        .on("presence", { event: "sync" }, () => {
          if (!isMountedRef.current) return;
          const state = channel.presenceState();
          const users: SyncedUser[] = [];
          Object.values(state).forEach((presences: any) => {
            presences.forEach((p: any) => {
              if (p.user_id && !users.find((u) => u.user_id === p.user_id)) {
                users.push({ user_id: p.user_id, display_name: p.display_name, avatar: p.avatar });
              }
            });
          });
          setSyncedUsers(users);
        })
        .on("broadcast", { event: "youtube_play" }, (payload) => {
          if (!isMountedRef.current) return;
          const data = payload.payload;
          if (data.sender_id !== user.id) {
            if (data.playlist_id) setActivePlaylistId(data.playlist_id);
            setActiveVideoId(data.video_id);
            setSharedBy(data.sender_name);
            setIsHost(false);
            if (data.playlist_url) setLastPlaylistUrl(data.playlist_url);
            toast(`🎵 ${data.sender_name} shared ${data.playlist_id ? 'a playlist' : 'a video'}!`);
          }
        })
        .on("broadcast", { event: "youtube_stop" }, (payload) => {
          if (!isMountedRef.current) return;
          const data = payload.payload;
          if (data?.sender_id !== user.id) {
            setActiveVideoId(null);
            setSharedBy("");
            setIsHost(false);
          }
        })
        .on("broadcast", { event: "youtube_playback" }, (payload) => {
          if (!isMountedRef.current) return;
          const data = payload.payload;
          if (data.sender_id === user.id) return; // Ignore own broadcasts
          
          const player = playerRef.current;
          if (!player || typeof player.seekTo !== "function") return;

          // Set guard to prevent our programmatic changes from re-broadcasting
          ignoreBroadcastRef.current = true;

          try {
            const networkDelay = (Date.now() - data.timestamp) / 1000;

            if (data.action === "paused") {
              player.seekTo(data.currentTime, true);
              player.pauseVideo();
              setIsPaused(true);
              lastHostSyncRef.current = null; // Stop drift correction while paused
            } else if (data.action === "playing") {
              const targetTime = data.currentTime + networkDelay;
              player.seekTo(targetTime, true);
              if (data.rate) player.setPlaybackRate(data.rate);
              player.playVideo();
              setIsPaused(false);
              // Record sync point for continuous drift correction
              lastHostSyncRef.current = { time: Date.now(), hostTime: targetTime, rate: data.rate || 1 };
            } else if (data.action === "speed") {
              if (data.rate) player.setPlaybackRate(data.rate);
              // Update sync ref rate
              if (lastHostSyncRef.current) {
                lastHostSyncRef.current.rate = data.rate || 1;
              }
            } else if (data.action === "heartbeat") {
              // Update authoritative sync point for continuous correction
              const expectedTime = data.currentTime + networkDelay;
              lastHostSyncRef.current = { time: Date.now(), hostTime: expectedTime, rate: data.rate || 1 };
              
              // Immediate correction if drift is too large
              const YT = (window as any).YT?.PlayerState;
              if (YT && player.getPlayerState() === YT.PLAYING) {
                const actualTime = player.getCurrentTime();
                const drift = Math.abs(expectedTime - actualTime);
                if (drift > DRIFT_THRESHOLD) {
                  player.seekTo(expectedTime, true);
                }
                // Also sync playback rate
                if (data.rate && player.getPlaybackRate() !== data.rate) {
                  player.setPlaybackRate(data.rate);
                }
              }
            }
          } catch (err) {
            console.error("Failed to sync playback:", err);
          } finally {
            // Release guard after a short delay to let YT state change events pass
            setTimeout(() => {
              ignoreBroadcastRef.current = false;
            }, 200);
          }
        })
        .subscribe(async (status) => {
          if (!isMountedRef.current) return;
          if (status === "SUBSCRIBED") {
            await channel.track({
              user_id: user.id,
              display_name: profile.display_name,
              avatar: profile.avatar,
            });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("YouTube sync channel error, reconnecting in 3s...");
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current) setupChannel();
            }, 3000);
          }
        });
    };

    setupChannel();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [currentRoom?.id, user?.id, profile?.display_name, profile?.avatar]);

  const shareVideo = useCallback(async () => {
    const videoId = extractYouTubeId(youtubeUrl);
    const playlistId = extractPlaylistId(youtubeUrl);
    const playlist = extractPlaylistUrl(youtubeUrl);

    // Accept either a video link or a playlist-only link
    if (!videoId && !playlistId) {
      toast.error("Paste a valid YouTube video or playlist link");
      return;
    }

    if (playlist) setLastPlaylistUrl(playlist);
    if (playlistId) setActivePlaylistId(playlistId);

    // For playlist-only URLs without a video ID, use a blank ID (YT API loads first playlist item)
    const effectiveVideoId = videoId || "";
    setActiveVideoId(effectiveVideoId || `playlist-${playlistId}`);
    setSharedBy(profile?.display_name || "You");
    setIsHost(true);

    if (channelRef.current) {
      try {
        await channelRef.current.send({
          type: "broadcast",
          event: "youtube_play",
          payload: {
            video_id: effectiveVideoId,
            sender_id: user?.id,
            sender_name: profile?.display_name || "Someone",
            playlist_url: playlist,
            playlist_id: playlistId,
          },
        });
        toast.success(playlistId ? "Playlist shared with your room! 🎶" : "Video shared with your room! 🎶");
      } catch (err) {
        console.error("Failed to broadcast video:", err);
        toast.error("Failed to share. Please try again.");
      }
    }

    setYoutubeUrl("");
  }, [youtubeUrl, user?.id, profile]);

  const stopVideo = useCallback(async () => {
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }
    setActiveVideoId(null);
    setActivePlaylistId(null);
    setSharedBy("");
    setIsHost(false);
    setIsPaused(false);
    lastHostSyncRef.current = null;
    if (channelRef.current) {
      try {
        await channelRef.current.send({
          type: "broadcast",
          event: "youtube_stop",
          payload: { sender_id: user?.id },
        });
      } catch (err) {
        console.error("Failed to broadcast stop:", err);
      }
    }
  }, [user?.id]);

  const togglePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.getPlayerState !== "function") return;
    const YT = (window as any).YT?.PlayerState;
    if (!YT) return;
    
    if (player.getPlayerState() === YT.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }, []);

  const openYouTubeApp = () => {
    const timeout = setTimeout(() => { window.open("https://www.youtube.com", "_blank"); }, 500);
    window.location.href = "vnd.youtube://";
    window.addEventListener("blur", () => clearTimeout(timeout), { once: true });
  };

  const copyInviteCode = () => {
    if (currentRoom?.invite_code) {
      navigator.clipboard.writeText(currentRoom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Invite code copied!");
    }
  };

  const handleJoinSession = async () => {
    const code = joinCode.trim();
    if (!code) {
      toast.error("Enter an invite code");
      return;
    }
    setIsJoining(true);
    try {
      const { error } = await joinRoom(code);
      if (error) {
        toast.error(error.message || "Failed to join. Check the code and try again.");
      } else {
        toast.success("Joined room! You're now synced 🎶");
        setJoinCode("");
        await refreshRooms();
      }
    } catch (err) {
      toast.error("Something went wrong. Try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Step-by-step Guide */}
      {!activeVideoId && (
        <Card className="border-dashed border-2 border-primary/20">
          <CardContent className="p-5">
            <h3 className="font-bold text-foreground mb-4 text-center">How to share music</h3>
            <div className="space-y-3">
              {[
                { step: "1", text: "Open YouTube on your phone", action: <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-destructive/30 text-destructive" onClick={openYouTubeApp}><Youtube className="h-4 w-4" /> Open</Button> },
                { step: "2", text: "Find a song & tap Share → Copy link", action: <Link className="h-4 w-4 text-muted-foreground shrink-0" /> },
                { step: "3", text: "Paste the link below & hit Share", action: <ArrowRight className="h-4 w-4 text-primary shrink-0" /> },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{item.step}</span>
                  </div>
                  <p className="flex-1 text-sm text-foreground">{item.text}</p>
                  {item.action}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Share Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Paste YouTube video or playlist link..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && shareVideo()}
          className="flex-1 h-12 rounded-xl"
        />
        <Button onClick={shareVideo} disabled={!youtubeUrl.trim()} className="h-12 px-5 rounded-xl gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>

      {/* Active Video with YouTube IFrame Player API */}
      {activeVideoId && (
        <Card className="overflow-hidden shadow-lg">
          <div className="relative">
            <div ref={playerContainerRef} className="w-full aspect-video" />
            {isHost && (
              <div className="absolute top-2 right-2 flex gap-1">
                <Button variant="secondary" size="icon" className="w-8 h-8 rounded-full opacity-90 hover:opacity-100" onClick={togglePlayPause}>
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
                <Button variant="destructive" size="icon" className="w-8 h-8 rounded-full opacity-80 hover:opacity-100" onClick={stopVideo}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Play className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate text-foreground">
                  {isHost ? "You're sharing (you control playback)" : `Shared by ${sharedBy} (synced)`}
                </span>
              </div>
              {isHost && (
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  <Music className="h-3 w-3 mr-1" /> Host
                </Badge>
              )}
            </div>
            {!isHost && (
              <p className="text-[10px] text-muted-foreground">
                🔒 Host controls playback. You're synced automatically — sit back and enjoy!
              </p>
            )}
            {lastPlaylistUrl && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 h-8 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(lastPlaylistUrl);
                  setPlaylistCopied(true);
                  setTimeout(() => setPlaylistCopied(false), 2000);
                  toast.success("Playlist link copied!");
                }}
              >
                {playlistCopied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
                {playlistCopied ? "Copied!" : "Copy Playlist Link"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Listeners & Invite */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Users className="h-4 w-4 text-primary" />
              {syncedUsers.length > 0 ? `${syncedUsers.length} Listening Now` : "No one else here yet"}
            </h3>
            <Button size="sm" variant="outline" className="gap-1.5 h-8 rounded-lg" onClick={copyInviteCode}>
              {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="text-xs">{copied ? "Copied!" : "Invite"}</span>
            </Button>
          </div>
          {syncedUsers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {syncedUsers.map((u) => (
                <div key={u.user_id} className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5">
                  <ProfileAvatar avatar={u.avatar} size="xs" />
                  <span className="text-xs font-medium text-foreground">{u.user_id === user?.id ? "You" : u.display_name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Share the invite code so your roommates can join and listen together!</p>
          )}

          {/* Join Session Input */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Have an invite code? Join a session:</p>
            <div className="flex gap-2">
              <Input
                placeholder="Enter invite code..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoinSession()}
                className="flex-1 h-10 rounded-xl uppercase tracking-widest font-semibold text-center"
                maxLength={6}
              />
              <Button
                onClick={handleJoinSession}
                disabled={!joinCode.trim() || isJoining}
                className="h-10 px-4 rounded-xl gap-1.5"
                size="sm"
              >
                <LogIn className="h-4 w-4" />
                {isJoining ? "Joining..." : "Join"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
