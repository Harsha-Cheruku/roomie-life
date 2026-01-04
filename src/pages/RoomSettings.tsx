import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Crown, UserMinus, Users, Copy, Check, RefreshCw, Plus, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomMemberWithProfile {
  user_id: string;
  role: string;
  display_name: string;
  avatar: string;
}

export const RoomSettings = () => {
  const { currentRoom, user, setCurrentRoom, userRooms, switchRoom, refreshRooms } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [roomName, setRoomName] = useState(currentRoom?.name || "");
  const [members, setMembers] = useState<RoomMemberWithProfile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [showRoomSwitcher, setShowRoomSwitcher] = useState(false);

  useEffect(() => {
    if (!currentRoom) {
      navigate("/setup");
      return;
    }
    setRoomName(currentRoom.name);
    fetchMembers();
  }, [currentRoom]);

  const fetchMembers = async () => {
    if (!currentRoom?.id) return;

    const { data: memberData } = await supabase
      .from("room_members")
      .select("user_id, role")
      .eq("room_id", currentRoom.id);

    if (!memberData || memberData.length === 0) {
      setMembers([]);
      return;
    }

    // Check if current user is admin
    const currentUserMember = memberData.find(m => m.user_id === user?.id);
    setIsAdmin(currentUserMember?.role === "admin");

    const userIds = memberData.map(m => m.user_id);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar")
      .in("user_id", userIds);

    const combined = memberData.map(member => {
      const profile = profileData?.find(p => p.user_id === member.user_id);
      return {
        user_id: member.user_id,
        role: member.role,
        display_name: profile?.display_name || "Unknown",
        avatar: profile?.avatar || "😎"
      };
    });

    setMembers(combined);
  };

  const handleSaveRoomName = async () => {
    if (!currentRoom || !roomName.trim()) return;

    setIsSaving(true);
    const { data, error } = await supabase
      .from("rooms")
      .update({ name: roomName.trim() })
      .eq("id", currentRoom.id)
      .select()
      .single();

    setIsSaving(false);

    if (error) {
      toast({
        title: "Failed to update room",
        description: error.message,
        variant: "destructive",
      });
    } else if (data) {
      setCurrentRoom({ ...currentRoom, name: data.name });
      toast({
        title: "Room updated",
        description: "Room name has been changed successfully",
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!currentRoom || memberId === user?.id) return;

    setRemovingUserId(memberId);
    const { error } = await supabase
      .from("room_members")
      .delete()
      .eq("user_id", memberId)
      .eq("room_id", currentRoom.id);

    setRemovingUserId(null);

    if (error) {
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Member removed",
        description: "The member has been removed from the room",
      });
      fetchMembers();
    }
  };

  const copyInviteCode = () => {
    if (currentRoom?.invite_code) {
      navigator.clipboard.writeText(currentRoom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Invite code copied to clipboard",
      });
    }
  };

  const handleSwitchRoom = (room: typeof currentRoom) => {
    if (room) {
      switchRoom(room);
      setShowRoomSwitcher(false);
      toast({
        title: `Switched to ${room.name}`,
      });
      navigate("/");
    }
  };

  const handleCreateNewRoom = () => {
    navigate("/setup");
  };

  if (!currentRoom) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">
            Room Settings
          </h1>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Room Switcher Section */}
        {userRooms.length > 0 && (
          <section className="bg-card rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Switch Room
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">{userRooms.length} room{userRooms.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-2">
              {userRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => room.id !== currentRoom.id && handleSwitchRoom(room)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left",
                    room.id === currentRoom.id 
                      ? "bg-primary/10 border-2 border-primary" 
                      : "bg-muted/50 hover:bg-muted border-2 border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-xl",
                    room.id === currentRoom.id ? "bg-primary/20" : "bg-muted"
                  )}>
                    🏠
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium truncate",
                      room.id === currentRoom.id ? "text-primary" : "text-foreground"
                    )}>
                      {room.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Code: {room.invite_code}
                    </p>
                  </div>
                  {room.id === currentRoom.id && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                      Current
                    </span>
                  )}
                </button>
              ))}
              
              <button
                onClick={handleCreateNewRoom}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-muted-foreground">Create or Join Room</p>
                  <p className="text-xs text-muted-foreground">Add another room</p>
                </div>
              </button>
            </div>
          </section>
        )}

        {/* Room Name Section */}
        <section className="bg-card rounded-2xl p-4 shadow-card">
          <h2 className="font-display text-lg font-semibold text-foreground mb-4">
            Room Details
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Room Name</label>
              <div className="flex gap-2">
                <Input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  disabled={!isAdmin}
                  className="flex-1"
                  maxLength={50}
                />
                {isAdmin && (
                  <Button 
                    onClick={handleSaveRoomName} 
                    disabled={isSaving || roomName === currentRoom.name}
                    variant="default"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground mt-1">Only admins can rename the room</p>
              )}
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Invite Code</label>
              <div className="flex items-center gap-3 bg-muted rounded-xl p-3">
                <span className="font-display text-2xl font-bold text-primary tracking-widest flex-1">
                  {currentRoom.invite_code}
                </span>
                <Button variant="ghost" size="icon" onClick={copyInviteCode}>
                  {copied ? <Check className="w-5 h-5 text-mint" /> : <Copy className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Members Section */}
        <section className="bg-card rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-semibold text-foreground">
              Members ({members.length})
            </h2>
          </div>

          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="relative w-10 h-10 rounded-full bg-card border-2 border-border flex items-center justify-center text-xl">
                  {member.avatar}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-muted bg-mint" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {member.display_name}
                    {member.user_id === user?.id && (
                      <span className="text-muted-foreground text-sm ml-2">(You)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1">
                    {member.role === "admin" && (
                      <span className="inline-flex items-center gap-1 text-xs text-accent font-medium">
                        <Crown className="w-3 h-3" />
                        Admin
                      </span>
                    )}
                    {member.role === "member" && (
                      <span className="text-xs text-muted-foreground">Member</span>
                    )}
                  </div>
                </div>
                {isAdmin && member.user_id !== user?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMember(member.user_id)}
                    disabled={removingUserId === member.user_id}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <UserMinus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {!isAdmin && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Only admins can remove members
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
