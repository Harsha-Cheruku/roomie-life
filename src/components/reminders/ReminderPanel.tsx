import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remind_at: string;
  status: string;
  reminder_type: string | null;
  related_id: string | null;
  created_by: string;
  notified: boolean;
}

interface ReminderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterType: "expense" | "task";
  onUpdate: () => void;
}

export const ReminderPanel = ({
  open,
  onOpenChange,
  filterType,
  onUpdate,
}: ReminderPanelProps) => {
  const { user, currentRoom } = useAuth();
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReminders = useCallback(async () => {
    if (!user || !currentRoom) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .eq("room_id", currentRoom.id)
      .eq("reminder_type", filterType)
      .or(`created_by.eq.${user.id},user_id.eq.${user.id}`)
      .order("remind_at", { ascending: true });

    if (!error) setReminders(data || []);
    setLoading(false);
  }, [user, currentRoom, filterType]);

  useEffect(() => {
    if (open) fetchReminders();
  }, [open, fetchReminders]);

  const handleComplete = async (id: string) => {
    const { error } = await supabase
      .from("reminders")
      .update({
        status: "completed",
        completed_by: user?.id,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (!error) {
      toast.success("Reminder completed");
      fetchReminders();
      onUpdate();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", id);

    if (!error) {
      toast.success("Reminder deleted");
      fetchReminders();
      onUpdate();
    }
  };

  const navigateToRelated = (reminder: Reminder) => {
    onOpenChange(false);
    if (reminder.reminder_type === "expense") {
      navigate("/expenses");
    } else if (reminder.reminder_type === "task") {
      navigate("/tasks");
    }
  };

  const activeReminders = reminders.filter((r) => r.status !== "completed");
  const completedReminders = reminders.filter((r) => r.status === "completed");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {filterType === "expense" ? "💰" : "📋"}{" "}
            {filterType === "expense" ? "Expense" : "Task"} Reminders
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : reminders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No reminders</p>
            </div>
          ) : (
            <>
              {activeReminders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Active ({activeReminders.length})
                  </p>
                  <div className="space-y-2">
                    {activeReminders.map((r) => {
                      const overdue = isPast(new Date(r.remind_at));
                      return (
                        <div
                          key={r.id}
                          className={cn(
                            "p-3 rounded-xl border",
                            overdue
                              ? "bg-coral/10 border-coral/30"
                              : "bg-muted/50 border-border"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {r.title}
                              </p>
                              {r.description && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {r.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px]",
                                    overdue && "bg-coral/20 text-coral"
                                  )}
                                >
                                  {overdue
                                    ? `Overdue ${formatDistanceToNow(new Date(r.remind_at))}`
                                    : format(new Date(r.remind_at), "MMM d, h:mm a")}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {r.status}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              {r.related_id && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => navigateToRelated(r)}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-600"
                                onClick={() => handleComplete(r.id)}
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleDelete(r.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {completedReminders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Completed ({completedReminders.length})
                  </p>
                  <div className="space-y-2">
                    {completedReminders.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 rounded-xl bg-muted/30 border border-border opacity-60"
                      >
                        <p className="font-medium text-sm line-through truncate">
                          {r.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(r.remind_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
