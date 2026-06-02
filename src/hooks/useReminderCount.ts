import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Shared subscription manager: one realtime channel per room is shared across
 * all ReminderBellIcon instances (expense + task), instead of one channel per
 * filter type per instance. Subscribers are notified on any change to the
 * room's reminders, then each refetches its own filtered count.
 */
type Subscriber = () => void;
const subs = new Map<string, Set<Subscriber>>();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();

const subscribeRoom = (roomId: string, cb: Subscriber) => {
  let set = subs.get(roomId);
  if (!set) {
    set = new Set();
    subs.set(roomId, set);
    const ch = supabase
      .channel(`reminders-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders", filter: `room_id=eq.${roomId}` },
        () => { subs.get(roomId)?.forEach((s) => s()); }
      )
      .subscribe();
    channels.set(roomId, ch);
  }
  set.add(cb);
  return () => {
    const s = subs.get(roomId);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) {
      const ch = channels.get(roomId);
      if (ch) supabase.removeChannel(ch);
      channels.delete(roomId);
      subs.delete(roomId);
    }
  };
};

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

  useEffect(() => {
    fetchCount();
    if (!currentRoom) return;
    return subscribeRoom(currentRoom.id, fetchCount);
  }, [currentRoom, fetchCount]);

  return { count, refetch: fetchCount };
}