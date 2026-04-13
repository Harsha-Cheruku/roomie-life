import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { Loader2, CheckCheck } from "lucide-react";

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
    if (!open || !messageId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchSeenBy = async () => {
      try {
        const { data: views } = await supabase
          .from("message_views")
          .select("user_id, seen_at")
          .eq("message_id", messageId)
          .order("seen_at", { ascending: false });

        if (!views?.length) {
          if (!cancelled) setSeenBy([]);
          return;
        }

        const userIds = views.map((v) => v.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

        if (!cancelled) {
          setSeenBy(
            views.map((v) => ({
              user_id: v.user_id,
              display_name: profileMap.get(v.user_id)?.display_name || "Unknown",
              avatar: profileMap.get(v.user_id)?.avatar || "😊",
              seen_at: v.seen_at,
            }))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchSeenBy();

    return () => {
      cancelled = true;
    };
  }, [open, messageId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm overflow-hidden rounded-[1.75rem] border-border/60 p-0">
        <DialogHeader className="border-b border-border/60 bg-muted/40 px-5 py-4 text-left">
          <div className="flex items-center gap-2 text-primary">
            <CheckCheck className="h-4 w-4" />
            <DialogTitle>Seen by</DialogTitle>
          </div>
          <DialogDescription>People who have opened this message in the room.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : seenBy.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No one has seen this yet.</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto px-4 py-4">
            {seenBy.map((u) => (
              <div key={u.user_id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 shadow-sm">
                <ProfileAvatar avatar={u.avatar} size="sm" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{u.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.seen_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <CheckCheck className="h-4 w-4 text-primary" />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
