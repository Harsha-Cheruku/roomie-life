import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Youtube, Share2, Users, Play, X, Music, ExternalLink, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

export const YouTubeSync = ({ className }: YouTubeSyncProps) => {
  const { user, currentRoom, profile } = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeVideoTitle, setActiveVideoTitle] = useState<string>("");
  const [sharedBy, setSharedBy] = useState<string>("");
  const [syncedUsers, setSyncedUsers] = useState<SyncedUser[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
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
              users.push({
                user_id: p.user_id,
                display_name: p.display_name,
                avatar: p.avatar,
              });
            }
          });
        });
        setSyncedUsers(users);
      })
      .on("broadcast", { event: "youtube_play" }, (payload) => {
        const data = payload.payload;
        if (data.sender_id !== user.id) {
          setActiveVideoId(data.video_id);
          setActiveVideoTitle(data.title || "Shared Video");
          setSharedBy(data.sender_name);
          setIsHost(false);
          toast(`🎵 ${data.sender_name} shared a video!`, {
            description: data.title || "YouTube video",
          });
        }
      })
      .on("broadcast", { event: "youtube_stop" }, () => {
        setActiveVideoId(null);
        setActiveVideoTitle("");
        setSharedBy("");
        setIsHost(false);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            display_name: profile.display_name,
            avatar: profile.avatar,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom?.id, user?.id, profile]);

  const shareVideo = useCallback(async () => {
    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      toast.error("Invalid YouTube URL. Paste a valid YouTube link.");
      return;
    }

    setActiveVideoId(videoId);
    setActiveVideoTitle(youtubeUrl);
    setSharedBy(profile?.display_name || "You");
    setIsHost(true);

    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "youtube_play",
        payload: {
          video_id: videoId,
          title: youtubeUrl,
          sender_id: user?.id,
          sender_name: profile?.display_name || "Someone",
        },
      });
    }

    toast.success("Video shared with your room! 🎶");
    setYoutubeUrl("");
  }, [youtubeUrl, user?.id, profile]);

  const stopVideo = useCallback(async () => {
    setActiveVideoId(null);
    setActiveVideoTitle("");
    setSharedBy("");
    setIsHost(false);

    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "youtube_stop",
        payload: {},
      });
    }
  }, []);

  const openYouTubeApp = () => {
    // Try to open YouTube app directly, fallback to browser
    const youtubeAppUrl = "vnd.youtube://";
    const youtubeWebUrl = "https://www.youtube.com";
    
    const timeout = setTimeout(() => {
      window.open(youtubeWebUrl, "_blank");
    }, 500);

    window.location.href = youtubeAppUrl;
    
    window.addEventListener("blur", () => {
      clearTimeout(timeout);
    }, { once: true });
  };

  const copyInviteCode = () => {
    if (currentRoom?.invite_code) {
      navigator.clipboard.writeText(currentRoom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Room invite code copied! Share it with friends to listen together.");
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={openYouTubeApp}
          variant="outline"
          className="h-auto py-3 flex flex-col items-center gap-2 border-destructive/30 hover:bg-destructive/5"
        >
          <Youtube className="h-6 w-6 text-destructive" />
          <span className="text-xs font-medium">Open YouTube</span>
        </Button>
        <Button
          onClick={copyInviteCode}
          variant="outline"
          className="h-auto py-3 flex flex-col items-center gap-2 border-primary/30 hover:bg-primary/5"
        >
          {copied ? <Check className="h-6 w-6 text-mint" /> : <Users className="h-6 w-6 text-primary" />}
          <span className="text-xs font-medium">{copied ? "Copied!" : "Invite People"}</span>
        </Button>
      </div>

      {/* YouTube Share Card */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            Share YouTube Music
          </h3>

          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Paste YouTube URL..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && shareVideo()}
              className="flex-1"
            />
            <Button onClick={shareVideo} size="sm" disabled={!youtubeUrl.trim()}>
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Open YouTube → copy a video link → paste it here to share with everyone
          </p>
        </CardContent>
      </Card>

      {/* Active Video Player */}
      {activeVideoId && (
        <Card className="overflow-hidden">
          <div className="relative">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?autoplay=1&rel=0&modestbranding=1`}
              className="w-full aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="YouTube video player"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 w-8 h-8 rounded-full opacity-80 hover:opacity-100"
              onClick={stopVideo}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Play className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">
                  {isHost ? "You're sharing" : `Shared by ${sharedBy}`}
                </span>
              </div>
              {isHost && (
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  <Music className="h-3 w-3 mr-1" />
                  Host
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Synced Users */}
      {syncedUsers.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {syncedUsers.length} Listening
            </h3>
            <div className="flex flex-wrap gap-2">
              {syncedUsers.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1"
                >
                  <Avatar className="w-5 h-5">
                    <AvatarFallback className="text-[10px]">
                      {u.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium">
                    {u.user_id === user?.id ? "You" : u.display_name}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
