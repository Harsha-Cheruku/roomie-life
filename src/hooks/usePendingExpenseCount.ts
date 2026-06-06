import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useVisibilityPoll } from "./useVisibilityPoll";

export const usePendingExpenseCount = () => {
  const { user, currentRoom, isSoloMode } = useAuth();
  const [pendingExpenseCount, setPendingExpenseCount] = useState(0);

  const fetchPendingExpenseCount = useCallback(async () => {
    if (!user?.id || !currentRoom?.id) {
      setPendingExpenseCount(0);
      return;
    }
    // Solo mode: no shared bills can be pending for the user
    if (isSoloMode) {
      setPendingExpenseCount(0);
      return;
    }

    const { count, error } = await supabase
      .from("expense_splits")
      .select("id, expense_id, expenses!inner(room_id, created_by)", { count: "exact", head: true })
      .eq("expenses.room_id", currentRoom.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .neq("expenses.created_by", user.id);

    if (!error) {
      setPendingExpenseCount(count || 0);
    }
  }, [currentRoom?.id, user?.id, isSoloMode]);

  // Lazy poll (60s, visible-tab only) — replaces 2 always-on realtime listeners.
  useVisibilityPoll(
    fetchPendingExpenseCount,
    60_000,
    [user?.id, currentRoom?.id, isSoloMode],
    !!(user?.id && currentRoom?.id && !isSoloMode),
  );

  return pendingExpenseCount;
};