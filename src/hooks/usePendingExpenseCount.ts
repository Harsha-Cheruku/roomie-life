import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    if (!user?.id || !currentRoom?.id) {
      setPendingExpenseCount(0);
      return;
    }
    if (isSoloMode) {
      setPendingExpenseCount(0);
      return;
    }

    void fetchPendingExpenseCount();

    const channel = supabase
      .channel(`pending-expense-count-${user.id}-${currentRoom.id}`)
      // Filter to only this user's splits to drastically reduce realtime traffic
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_splits", filter: `user_id=eq.${user.id}` },
        () => {
          void fetchPendingExpenseCount();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses", filter: `room_id=eq.${currentRoom.id}` },
        () => {
          void fetchPendingExpenseCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom?.id, fetchPendingExpenseCount, user?.id, isSoloMode]);

  return pendingExpenseCount;
};