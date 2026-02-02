import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook that automatically marks expenses as settled when all splits are paid
 */
export const useAutoSettleBills = () => {
  const { currentRoom } = useAuth();

  const checkAndSettleExpense = useCallback(async (expenseId: string) => {
    // Get all splits for this expense
    const { data: splits, error: splitsError } = await supabase
      .from('expense_splits')
      .select('id, is_paid, status')
      .eq('expense_id', expenseId);

    if (splitsError || !splits) {
      console.error('Error checking splits:', splitsError);
      return;
    }

    // Check if all splits are paid
    const allPaid = splits.every(split => split.is_paid || split.status === 'accepted');
    const allAccepted = splits.every(split => split.status === 'accepted' || split.status === 'pending');
    const allSplitsPaid = splits.every(split => split.is_paid);

    if (allSplitsPaid && splits.length > 0) {
      // Update expense status to settled
      const { error: updateError } = await supabase
        .from('expenses')
        .update({ status: 'settled' })
        .eq('id', expenseId);

      if (updateError) {
        console.error('Error settling expense:', updateError);
      } else {
        console.log('Expense auto-settled:', expenseId);
      }
    }
  }, []);

  useEffect(() => {
    if (!currentRoom) return;

    // Subscribe to expense_splits changes
    const channel = supabase
      .channel('auto-settle-splits')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'expense_splits',
        },
        async (payload) => {
          const split = payload.new as { expense_id: string; is_paid: boolean };
          if (split.is_paid) {
            await checkAndSettleExpense(split.expense_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom, checkAndSettleExpense]);

  return { checkAndSettleExpense };
};
