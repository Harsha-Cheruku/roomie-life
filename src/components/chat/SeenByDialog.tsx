import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { Loader2 } from "lucide-react";

interface SeenByDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
}

interface SeenByUser {
  user_id: string;
  display_name: string;
  avatar: string;
  seen_at: string;
}

export const SeenByDialog = ({ open, onOpenChange, messageId }: SeenByDialogProps) => {
  const [seenBy, setSeenBy] = useState<SeenByUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !messageId) return;
    setLoading(true);

    const fetchSeenBy = async () => {
      const { data: views } = await supabase
        .from("message_views")
        .select("user_id, seen_at")
        .eq("message_id", messageId);

      if (!views?.length) { setSeenBy([]); setLoading(false); return; }

      const userIds = views.map((v) => v.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      setSeenBy(
        views.map((v) => ({
          user_id: v.user_id,
          display_name: profileMap.get(v.user_id)?.display_name || "Unknown",
          avatar: profileMap.get(v.user_id)?.avatar || "😊",
          seen_at: v.seen_at,
        }))
      );
      setLoading(false);
    };

    fetchSeenBy();
  }, [open, messageId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Seen by</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : seenBy.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No one has seen this yet</p>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {seenBy.map((u) => (
              <div key={u.user_id} className="flex items-center gap-3">
                <ProfileAvatar avatar={u.avatar} size="sm" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{u.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.seen_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
