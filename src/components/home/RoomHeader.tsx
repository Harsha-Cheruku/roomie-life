import { Bell, Settings, Users, LogOut, Copy, Check, DoorOpen, Cog, RefreshCw, Circle, User, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useNotificationBell } from "@/hooks/useNotificationBell";

interface RoomMemberWithProfile {
  user_id: string;
  role: string;
  display_name: string;
  avatar: string;
  is_online?: boolean;
  last_seen?: string;
}

export const RoomHeader = () => {
  const { currentRoom, profile, signOut, leaveRoom, userRooms, switchRoom, user, isSoloMode, toggleSoloMode } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { unreadCount } = useNotificationBell();
  const [members, setMembers] = useState<RoomMemberWithProfile[]>([]);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRoomSwitcher, setShowRoomSwitcher] = useState(false);

  useEffect(() => {
    if (currentRoom?.id) {
      fetchMembers();
      
      // Subscribe to presence for online status
      const channel = supabase.channel(`room-presence-${currentRoom.id}`);
      
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          updateOnlineStatus(state);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && user) {
            await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentRoom?.id, user?.id]);

  const updateOnlineStatus = (presenceState: Record<string, any[]>) => {
    const onlineUsers = new Set<string>();
    Object.values(presenceState).forEach(presences => {
      presences.forEach((p: any) => {
        if (p.user_id) onlineUsers.add(p.user_id);
      });
    });
    
    setMembers(prev => prev.map(m => ({
      ...m,
      is_online: onlineUsers.has(m.user_id)
    })));
  };

  const fetchMembers = async () => {
    if (!currentRoom?.id) return;
    
    // First get room members
    const { data: memberData } = await supabase
      .from("room_members")
      .select("user_id, role")
      .eq("room_id", currentRoom.id);

    if (!memberData || memberData.length === 0) {
      setMembers([]);
      return;
    }

    // Then fetch profiles for those members
    const userIds = memberData.map(m => m.user_id);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar")
      .in("user_id", userIds);

    // Combine the data
    const combined = memberData.map(member => {
      const prof = profileData?.find(p => p.user_id === member.user_id);
      return {
        user_id: member.user_id,
        role: member.role,
        display_name: prof?.display_name || "Unknown",
        avatar: prof?.avatar || "😎",
        is_online: false,
        last_seen: undefined
      };
    });

    setMembers(combined);
  };

  const copyInviteCode = () => {
    if (currentRoom?.invite_code) {
      navigator.clipboard.writeText(currentRoom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied! 📋",
        description: "Share this code with your roommates",
      });
    }
  };

  const handleSignOut = async () => {
    setShowMenu(false);
    // Sign out just logs out - does NOT leave room
    await signOut();
    navigate('/auth');
  };

  // Check if current user is admin of current room
  const isCurrentUserAdmin = members.find(m => m.user_id === user?.id)?.role === 'admin';

  const handleLeaveRoom = async () => {
    setShowMenu(false);
    
    // If admin is trying to leave, warn them
    if (isCurrentUserAdmin) {
      const otherMembers = members.filter(m => m.user_id !== user?.id);
      if (otherMembers.length > 0) {
        toast({
          title: "You're the admin!",
          description: "Please transfer admin role to another member before leaving, or remove all members first.",
          variant: "destructive",
        });
        navigate('/room-settings');
        return;
      }
    }

    const { error } = await leaveRoom();
    if (error) {
      toast({
        title: "Couldn't leave room",
        description: "Something went wrong. Try again?",
        variant: "destructive",
      });
    } else {
      toast({
        title: "You've left the room 👋",
        description: "You can rejoin anytime with the invite code",
      });
      // If no more rooms, go to setup
      if (userRooms.length <= 1) {
        navigate("/setup");
      }
    }
  };

  const handleSwitchRoom = (room: typeof currentRoom) => {
    if (room) {
      switchRoom(room);
      setShowRoomSwitcher(false);
      toast({
        title: `Switched to ${room.name}`,
      });
    }
  };

  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return 'Offline';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  return (
    <header className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back 👋</p>
          <button 
            onClick={() => userRooms.length > 1 && setShowRoomSwitcher(!showRoomSwitcher)}
            className={cn(
              "font-display text-2xl font-bold text-foreground flex items-center gap-2",
              userRooms.length > 1 && "hover:text-primary transition-colors"
            )}
          >
            {currentRoom?.name || "Room"}
            {userRooms.length > 1 && (
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="glass" 
            size="icon" 
            className="relative press-effect"
            onClick={() => navigate('/notifications')}
          >
            <Bell className="w-5 h-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-coral rounded-full text-[10px] font-bold text-primary-foreground flex items-center justify-center animate-bounce-soft">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
          <div className="relative">
            <Button variant="glass" size="icon" onClick={() => setShowMenu(!showMenu)} className="press-effect">
              <Settings className="w-5 h-5 text-foreground" />
            </Button>
            {showMenu && (
              <>
                {/* Backdrop to close menu when clicking outside */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-12 bg-card rounded-xl shadow-lg border border-border p-2 min-w-[180px] z-50 animate-scale-in">
                <button
                  onClick={() => { setShowMenu(false); navigate("/room-settings"); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left press-effect"
                >
                  <Cog className="w-4 h-4" />
                  <span className="text-sm">Room Settings</span>
                </button>
                {/* Admin Panel - Only visible for admins */}
                {isCurrentUserAdmin && (
                  <button
                    onClick={() => { setShowMenu(false); navigate("/admin"); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left press-effect"
                  >
                    <Crown className="w-4 h-4 text-accent" />
                    <span className="text-sm">Admin Panel</span>
                  </button>
                )}
                <button
                  onClick={copyInviteCode}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left press-effect"
                >
                  {copied ? <Check className="w-4 h-4 text-mint" /> : <Copy className="w-4 h-4" />}
                  <span className="text-sm">Share Invite Code</span>
                </button>
                {userRooms.length > 1 && (
                  <button
                    onClick={() => { setShowMenu(false); setShowRoomSwitcher(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left press-effect"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm">Switch Room</span>
                  </button>
                )}
                <button
                  onClick={() => { toggleSoloMode(); setShowMenu(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left press-effect",
                    isSoloMode && "bg-primary/10"
                  )}
                >
                  <User className="w-4 h-4" />
                  <div className="flex-1">
                    <span className="text-sm">{isSoloMode ? 'Exit Solo Mode' : 'Solo Mode'}</span>
                    <p className="text-[10px] text-muted-foreground/70">
                      {isSoloMode ? 'Return to group tracking' : 'Track personal items only'}
                    </p>
                  </div>
                  {isSoloMode && <Check className="w-4 h-4 text-primary" />}
                </button>
                <div className="border-t border-border my-1"></div>
                <button
                  onClick={handleLeaveRoom}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/10 text-muted-foreground transition-colors text-left press-effect"
                >
                  <DoorOpen className="w-4 h-4" />
                  <div>
                    <span className="text-sm">Leave Room</span>
                    <p className="text-[10px] text-muted-foreground/70">You can rejoin anytime</p>
                  </div>
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-left press-effect"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Sign Out</span>
                </button>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Room Switcher Dropdown */}
      {showRoomSwitcher && userRooms.length > 1 && (
        <div className="mb-4 bg-card rounded-xl shadow-lg border border-border p-2 animate-slide-up">
          <p className="text-xs text-muted-foreground px-3 py-1">Switch Room</p>
          {userRooms.map(room => (
            <button
              key={room.id}
              onClick={() => handleSwitchRoom(room)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left press-effect",
                room.id === currentRoom?.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
              )}
            >
              <span className="text-lg">🏠</span>
              <span className="text-sm font-medium">{room.name}</span>
              {room.id === currentRoom?.id && <Check className="w-4 h-4 ml-auto" />}
            </button>
          ))}
        </div>
      )}

      {/* Roommates Row with Online Status */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-3">
          {members.slice(0, 4).map((member, index) => (
            <div
              key={member.user_id}
              className="relative w-10 h-10 rounded-full bg-card border-2 border-background flex items-center justify-center text-xl shadow-sm animate-scale-in"
              style={{ animationDelay: `${index * 50}ms`, zIndex: members.length - index }}
              title={`${member.display_name}${member.is_online ? ' (Online)' : ''}`}
            >
              {member.avatar || "😎"}
              {/* Online indicator */}
              <span 
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                  member.is_online ? "bg-mint" : "bg-muted-foreground/50"
                )}
              />
            </div>
          ))}
          {members.length > 4 && (
            <div className="w-10 h-10 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-bold text-muted-foreground">
              +{members.length - 4}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="ml-2 text-muted-foreground">
          <Users className="w-4 h-4 mr-1" />
          {members.length} Roommate{members.length !== 1 ? "s" : ""}
          {members.filter(m => m.is_online).length > 0 && (
            <span className="ml-1 text-mint">
              · {members.filter(m => m.is_online).length} online
            </span>
          )}
        </Button>
      </div>
    </header>
  );
};
