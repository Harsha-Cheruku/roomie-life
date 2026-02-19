import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle } from "lucide-react";

interface RecentMessage {
  id: string;
  content: string;
  sender_id: string;
  message_type: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
}

export const RecentMessagesPreview = () => {
  const navigate = useNavigate();
  const { currentRoom, user } = useAuth();
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);

  useEffect(() => {
    if (!currentRoom?.id) return;
    
    fetchRecentMessages();

    const channel = supabase
      .channel('home-messages-preview')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoom.id}` }, () => fetchRecentMessages())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentRoom?.id]);

  const fetchRecentMessages = async () => {
    if (!currentRoom?.id) return;

    try {
      const { data: msgs, error } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", currentRoom.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      if (!msgs || msgs.length === 0) { setRecentMessages([]); return; }

      const senderIds = [...new Set(msgs.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar")
        .in("user_id", senderIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Deduplicate: one message per sender (most recent)
      const seen = new Set<string>();
      const deduped: RecentMessage[] = [];
      for (const msg of msgs) {
        if (!seen.has(msg.sender_id)) {
          seen.add(msg.sender_id);
          deduped.push({
            ...msg,
            sender_name: profileMap.get(msg.sender_id)?.display_name || "Unknown",
            sender_avatar: profileMap.get(msg.sender_id)?.avatar || "😊",
          });
        }
      }

      setRecentMessages(deduped.slice(0, 4));
    } catch (error) {
      console.error("Error fetching recent messages:", error);
    }
  };

  if (recentMessages.length === 0) return null;

  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-accent" />
          Chats
        </h3>
        <button
          onClick={() => navigate("/chat")}
          className="text-xs text-primary font-medium"
        >
          Open Chat →
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {recentMessages.map((msg) => (
          <button
            key={msg.id}
            onClick={() => navigate("/chat")}
            className="flex flex-col items-center gap-1.5 min-w-[64px] max-w-[80px] group"
          >
            <div className="relative w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl flex-shrink-0 group-hover:ring-2 ring-primary/30 transition-all">
              {msg.sender_avatar}
              {/* New message indicator */}
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent border-2 border-background" />
            </div>
            <span className="text-[11px] font-medium text-foreground truncate w-full text-center">
              {msg.sender_id === user?.id ? "You" : msg.sender_name}
            </span>
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">
              {msg.message_type === "text" ? msg.content.slice(0, 20) : `📎 ${msg.message_type}`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};
