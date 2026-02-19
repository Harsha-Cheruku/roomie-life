import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, ArrowRight } from "lucide-react";

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
  const { currentRoom } = useAuth();
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
        .limit(3);

      if (error) throw error;
      if (!msgs || msgs.length === 0) { setRecentMessages([]); return; }

      const senderIds = [...new Set(msgs.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar")
        .in("user_id", senderIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setRecentMessages(msgs.map(msg => ({
        ...msg,
        sender_name: profileMap.get(msg.sender_id)?.display_name || "Unknown",
        sender_avatar: profileMap.get(msg.sender_id)?.avatar || "😊",
      })));
    } catch (error) {
      console.error("Error fetching recent messages:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  };

  if (recentMessages.length === 0) return null;

  return (
    <section className="px-4">
      <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate("/chat")}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-accent" />
              Recent Messages
            </h3>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            {recentMessages.map((msg) => (
              <div key={msg.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm flex-shrink-0">
                  {msg.sender_avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{msg.sender_name}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {msg.message_type === "text" ? msg.content : `Sent a ${msg.message_type}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
