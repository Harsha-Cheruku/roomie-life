import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Minimal reminder notification hook.
 * Relies on server-side process-reminders edge function for triggering.
 * Only listens to realtime for in-app toast when a reminder status changes to 'notified'.
 * NO polling, NO timers.
 */
export const useReminderNotifications = () => {
  const { user, currentRoom } = useAuth();

  useEffect(() => {
    if (!user || !currentRoom?.id) return;

    // Listen for server-side reminder triggers via realtime
    const channel = supabase
      .channel('reminder-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reminders',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        (payload) => {
          const newRecord = payload.new as any;
          if (!newRecord || newRecord.status !== 'notified') return;

          // Only show toast if this reminder is relevant to this user
          const isRelevant =
            newRecord.created_by === user.id ||
            newRecord.user_id === user.id;

          if (isRelevant) {
            const typeEmoji = newRecord.reminder_type === 'expense' ? '💰' : newRecord.reminder_type === 'task' ? '📋' : '⏰';
            toast.success(`${typeEmoji} ${newRecord.title}`, {
              description: newRecord.description || 'Reminder is due now!',
              duration: 10000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, currentRoom?.id]);
};
