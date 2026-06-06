import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVisibilityPoll } from "./useVisibilityPoll";

export function useReminderCount(filterType: "expense" | "task") {
  const { user, currentRoom } = useAuth();
  const [count, setCount] = useState(0);

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

  // Lazy poll (90s, visible-tab only) — replaces always-on realtime channel.
  useVisibilityPoll(fetchCount, 90_000, [currentRoom?.id, user?.id, filterType], !!currentRoom);

  return { count, refetch: fetchCount };
}