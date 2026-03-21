import { useState, useEffect, useCallback } from "react";
import { Home, ListTodo, Receipt, Cloud, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface NavItem {
  icon: React.ElementType;
  label: string;
  id: string;
  color: string;
}

const navItems: NavItem[] = [
  { icon: Home, label: "Home", id: "home", color: "text-primary" },
  { icon: ListTodo, label: "Tasks", id: "tasks", color: "text-mint" },
  { icon: Receipt, label: "Expenses", id: "expenses", color: "text-coral" },
  { icon: Cloud, label: "Storage", id: "storage", color: "text-lavender" },
  { icon: MessageCircle, label: "Chat", id: "chat", color: "text-accent" },
];

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const { user, currentRoom } = useAuth();
  const [unreadChat, setUnreadChat] = useState(0);
  const isChatTabOpen = activeTab === "chat";

  // Track unread chat messages (messages since last visit)
  const fetchUnread = useCallback(async () => {
    if (!currentRoom?.id || !user?.id) {
      setUnreadChat(0);
      return;
    }

    const lastSeenKey = `chat_last_seen_${user.id}_${currentRoom.id}`;
    const lastSeen = localStorage.getItem(lastSeenKey) || new Date(0).toISOString();

    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", currentRoom.id)
      .neq("sender_id", user.id)
      .gt("created_at", lastSeen);

    if (!error) {
      setUnreadChat(count || 0);
    }
  }, [currentRoom?.id, user?.id]);

  // When chat tab is open, immediately mark as seen and clear badge
  useEffect(() => {
    if (isChatTabOpen && currentRoom?.id && user?.id) {
      const key = `chat_last_seen_${user.id}_${currentRoom.id}`;
      localStorage.setItem(key, new Date().toISOString());
      setUnreadChat(0);
    }
  }, [isChatTabOpen, currentRoom?.id, user?.id]);

  // Only fetch unread & subscribe when NOT on chat tab
  useEffect(() => {
    if (!currentRoom?.id || !user?.id || isChatTabOpen) {
      if (isChatTabOpen) setUnreadChat(0);
      return;
    }

    fetchUnread();

    const channelName = `chat-badge-${user.id}-${currentRoom.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${currentRoom.id}` },
        (payload) => {
          const msg = payload.new as { sender_id?: string };
          if (msg?.sender_id && msg.sender_id !== user.id) {
            setUnreadChat(prev => prev + 1);
          }
        }
      )
      .subscribe();

    const pollTimer = window.setInterval(fetchUnread, 30000);

    return () => {
      window.clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [currentRoom?.id, user?.id, isChatTabOpen, fetchUnread]);

  // When user switches to chat, mark as seen
  useEffect(() => {
    if (activeTab === "chat" && currentRoom?.id && user?.id) {
      localStorage.setItem(`chat_last_seen_${user.id}_${currentRoom.id}`, new Date().toISOString());
      setUnreadChat(0);
    }
  }, [activeTab, currentRoom?.id, user?.id]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 px-2 pb-safe">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const showBadge = item.id === "chat" && unreadChat > 0;
          const isUnreadChat = item.id === "chat" && unreadChat > 0 && !isActive;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "relative flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all duration-300 press-effect",
                isActive
                  ? "bg-primary/10 scale-105"
                  : "hover:bg-muted/50",
                isUnreadChat && "ring-1 ring-accent/40"
              )}
            >
              <div className="relative">
                <item.icon
                  className={cn(
                    "w-6 h-6 transition-all duration-300",
                    isActive || isUnreadChat ? item.color : "text-muted-foreground"
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-coral text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1 animate-scale-in">
                    {unreadChat > 9 ? "9+" : unreadChat}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  isActive || isUnreadChat ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary animate-scale-in" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
