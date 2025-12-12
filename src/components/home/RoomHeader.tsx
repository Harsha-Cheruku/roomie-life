import { Bell, Settings, Users, LogOut, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RoomMemberWithProfile {
  user_id: string;
  role: string;
  display_name: string;
  avatar: string;
}

export const RoomHeader = () => {
  const { currentRoom, profile, signOut } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<RoomMemberWithProfile[]>([]);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (currentRoom?.id) {
      fetchMembers();
    }
  }, [currentRoom?.id]);

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

  const copyInviteCode = () => {
    if (currentRoom?.invite_code) {
      navigator.clipboard.writeText(currentRoom.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: `Invite code: ${currentRoom.invite_code}`,
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back 👋</p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {currentRoom?.name || "Room"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="glass" size="icon" className="relative">
            <Bell className="w-5 h-5 text-foreground" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-coral rounded-full text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              3
            </span>
          </Button>
          <div className="relative">
            <Button variant="glass" size="icon" onClick={() => setShowMenu(!showMenu)}>
              <Settings className="w-5 h-5 text-foreground" />
            </Button>
            {showMenu && (
              <div className="absolute right-0 top-12 bg-card rounded-xl shadow-lg border border-border p-2 min-w-[180px] z-50 animate-scale-in">
                <button
                  onClick={copyInviteCode}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  {copied ? <Check className="w-4 h-4 text-mint" /> : <Copy className="w-4 h-4" />}
                  <span className="text-sm">Copy Invite Code</span>
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Roommates Row */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-3">
          {members.slice(0, 4).map((member, index) => (
            <div
              key={member.user_id}
              className="w-10 h-10 rounded-full bg-card border-2 border-background flex items-center justify-center text-xl shadow-sm animate-scale-in"
              style={{ animationDelay: `${index * 50}ms`, zIndex: members.length - index }}
              title={member.display_name}
            >
              {member.avatar || "😎"}
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
        </Button>
      </div>
    </header>
  );
};
