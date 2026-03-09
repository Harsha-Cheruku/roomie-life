import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Youtube, Share2, Users, Play, X, Music, Copy, Check, Link, ArrowRight, LogIn } from "lucide-react";
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

const extractPlaylistUrl = (url: string): string | null => {
  const match = url.match(/[?&]list=([^&\s]+)/);
  if (match) {
    return `https://youtube.com/playlist?list=${match[1]}`;
  }
  return null;
};

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
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!currentRoom?.id || !user || !profile) return;
    const channel = supabase.channel(`youtube-sync-${currentRoom.id}`);
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
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
        const data = payload.payload;
        if (data.sender_id !== user.id) {
          setActiveVideoId(data.video_id);
          setSharedBy(data.sender_name);
          setIsHost(false);
          toast(`🎵 ${data.sender_name} shared a video!`);
        }
      })
      .on("broadcast", { event: "youtube_stop" }, () => {
        setActiveVideoId(null);
        setSharedBy("");
        setIsHost(false);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: user.id, display_name: profile.display_name, avatar: profile.avatar });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [currentRoom?.id, user?.id, profile]);

  const shareVideo = useCallback(async () => {
    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      toast.error("Paste a valid YouTube link (e.g. youtube.com/watch?v=...)");
      return;
    }
    setActiveVideoId(videoId);
    setSharedBy(profile?.display_name || "You");
    setIsHost(true);

    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "youtube_play",
        payload: { video_id: videoId, sender_id: user?.id, sender_name: profile?.display_name || "Someone" },
      });
    }
    toast.success("Video shared with your room! 🎶");
    
    // Extract and save playlist URL if present
    const playlist = extractPlaylistUrl(youtubeUrl);
    if (playlist) setLastPlaylistUrl(playlist);
    
    setYoutubeUrl("");
  }, [youtubeUrl, user?.id, profile]);

  const stopVideo = useCallback(async () => {
    setActiveVideoId(null);
    setSharedBy("");
    setIsHost(false);
    if (channelRef.current) {
      await channelRef.current.send({ type: "broadcast", event: "youtube_stop", payload: {} });
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
    const { error } = await joinRoom(code);
    setIsJoining(false);
    if (error) {
      toast.error(error.message || "Failed to join. Check the code and try again.");
    } else {
      toast.success("Joined room! You're now synced 🎶");
      setJoinCode("");
      await refreshRooms();
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
          placeholder="Paste YouTube link here..."
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

      {/* Active Video */}
      {activeVideoId && (
        <Card className="overflow-hidden shadow-lg">
          <div className="relative">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&rel=0&modestbranding=1`}
              className="w-full aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="YouTube video"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
            <Button variant="destructive" size="icon" className="absolute top-2 right-2 w-8 h-8 rounded-full opacity-80 hover:opacity-100" onClick={stopVideo}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Play className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate text-foreground">
                  {isHost ? "You're sharing" : `Shared by ${sharedBy}`}
                </span>
              </div>
              {isHost && (
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  <Music className="h-3 w-3 mr-1" /> Host
                </Badge>
              )}
            </div>
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
