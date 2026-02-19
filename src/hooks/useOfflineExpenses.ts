import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface OfflineExpense {
  id: string;
  room_id: string;
  created_by: string;
  paid_by: string;
  title: string;
  total_amount: number;
  category: string;
  split_type: string;
  notes: string | null;
  status: string;
  created_at: string;
  splits: Array<{
    user_id: string;
    amount: number;
    is_paid: boolean;
    status: string;
  }>;
}

const OFFLINE_QUEUE_KEY = 'roomsync_offline_expenses';

function getQueue(): OfflineExpense[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setQueue(queue: OfflineExpense[]) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export function useOfflineExpenses() {
  const { user, currentRoom } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(getQueue().length);

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); syncQueue(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const syncQueue = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;

    const remaining: OfflineExpense[] = [];

    for (const exp of queue) {
      try {
        const { data: expense, error: expErr } = await supabase
          .from('expenses')
          .insert({
            room_id: exp.room_id,
            created_by: exp.created_by,
            paid_by: exp.paid_by,
            title: exp.title,
            total_amount: exp.total_amount,
            category: exp.category,
            split_type: exp.split_type,
            notes: exp.notes,
            status: exp.status,
          })
          .select()
          .single();

        if (expErr) { remaining.push(exp); continue; }

        const splits = exp.splits.map(s => ({
          expense_id: expense.id,
          user_id: s.user_id,
          amount: s.amount,
          is_paid: s.is_paid,
          status: s.status,
        }));

        await supabase.from('expense_splits').insert(splits);
      } catch {
        remaining.push(exp);
      }
    }

    setQueue(remaining);
    setPendingCount(remaining.length);

    if (remaining.length < queue.length) {
      toast.success(`Synced ${queue.length - remaining.length} offline expense(s)`);
    }
  }, []);

  const queueExpense = useCallback((expense: OfflineExpense) => {
    const queue = getQueue();
    queue.push(expense);
    setQueue(queue);
    setPendingCount(queue.length);
  }, []);

  // Try syncing on mount if online
  useEffect(() => {
    if (isOnline && getQueue().length > 0) {
      syncQueue();
    }
  }, [isOnline, syncQueue]);

  return { isOnline, pendingCount, queueExpense, syncQueue };
}
