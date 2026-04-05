import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const usePendingExpenseCount = () => {
  const { user, currentRoom } = useAuth();
  const [pendingExpenseCount, setPendingExpenseCount] = useState(0);

  const fetchPendingExpenseCount = useCallback(async () => {
    if (!user?.id || !currentRoom?.id) {
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
  }, [currentRoom?.id, user?.id]);

  useEffect(() => {
    if (!user?.id || !currentRoom?.id) {
      setPendingExpenseCount(0);
      return;
    }

    void fetchPendingExpenseCount();

    const channel = supabase
      .channel(`pending-expense-count-${user.id}-${currentRoom.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits" }, () => {
        void fetchPendingExpenseCount();
      })
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
  }, [currentRoom?.id, fetchPendingExpenseCount, user?.id]);

  return pendingExpenseCount;
};