import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ReminderPanel } from "./ReminderPanel";

interface ReminderBellIconProps {
  /** Filter reminders by type: 'expense' or 'task' */
  filterType: "expense" | "task";
}

export const ReminderBellIcon = ({ filterType }: ReminderBellIconProps) => {
  const { user, currentRoom } = useAuth();
  const [count, setCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);

  const fetchCount = useCallback(async () => {
    if (!user || !currentRoom) return;

    const { count: c, error } = await supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("room_id", currentRoom.id)
      .eq("reminder_type", filterType)
      .in("status", ["scheduled", "notified"])
      .or(`created_by.eq.${user.id},user_id.eq.${user.id}`);

    if (!error && c !== null) setCount(c);
  }, [user, currentRoom, filterType]);

  useEffect(() => {
    fetchCount();

    if (!currentRoom) return;

    const channel = supabase
      .channel(`reminder-bell-${filterType}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
          filter: `room_id=eq.${currentRoom.id}`,
        },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom, fetchCount, filterType]);

  return (
    <>
      <Button
        variant="glass"
        size="iconSm"
        className="relative press-effect"
        onClick={() => setShowPanel(true)}
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-coral text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>

      <ReminderPanel
        open={showPanel}
        onOpenChange={setShowPanel}
        filterType={filterType}
        onUpdate={fetchCount}
      />
    </>
  );
};
