import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNotifications } from '@/hooks/useNotifications';

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remind_at: string;
  status: string;
  created_by: string;
  room_id: string;
  allowed_completers: string[] | null;
}

export const useReminderNotifications = () => {
  const { user, currentRoom } = useAuth();
  const notifiedReminders = useRef<Set<string>>(new Set());
  const checkInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const { sendReminderNotification, playNotificationSound } = useNotifications();

  // Load already-notified IDs from sessionStorage to prevent duplicates across re-renders
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('notified-reminders');
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        ids.forEach(id => notifiedReminders.current.add(id));
      }
    } catch {}
  }, []);

  const persistNotifiedIds = useCallback(() => {
    try {
      const ids = Array.from(notifiedReminders.current).slice(-100); // Keep last 100
      sessionStorage.setItem('notified-reminders', JSON.stringify(ids));
    } catch {}
  }, []);

  const createNotification = useCallback(async (reminder: Reminder) => {
    if (!user || !currentRoom) return;

    try {
      // Play sound
      try {
        await playNotificationSound('reminder');
      } catch (e) {
        setTimeout(() => playNotificationSound('reminder').catch(() => {}), 500);
      }
      
      // Vibrate
      if ('vibrate' in navigator) {
        try { navigator.vibrate([300, 100, 300, 100, 300]); } catch {}
      }
      
      // Browser notification
      sendReminderNotification(reminder.title, reminder.description || 'Reminder is due now!');
      
      // In-app toast
      toast.success(`⏰ ${reminder.title}`, {
        description: reminder.description || 'Reminder is due now!',
        duration: 15000,
      });
    } catch (error) {
      console.error('Error creating reminder notification:', error);
      toast.error(`⏰ ${reminder.title}`, {
        description: 'Reminder triggered (notification error)',
        duration: 10000,
      });
    }
  }, [user, currentRoom, sendReminderNotification, playNotificationSound]);

  const checkReminders = useCallback(async () => {
    if (!user || !currentRoom?.id) return;

    try {
      // Check for reminders that were set to 'notified' by the server-side cron
      // AND for reminders that are due but still 'scheduled' (client-side fallback)
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 300000);

      const { data: dueReminders, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('room_id', currentRoom.id)
        .in('status', ['scheduled', 'notified'])
        .gte('remind_at', fiveMinAgo.toISOString())
        .lte('remind_at', new Date(now.getTime() + 30000).toISOString());

      if (error) throw error;

      if (dueReminders) {
        for (const reminder of dueReminders) {
          // Skip if already notified locally
          if (notifiedReminders.current.has(reminder.id)) continue;

          const allowedCompleters = reminder.allowed_completers || [];
          const shouldNotify = 
            reminder.created_by === user.id || 
            allowedCompleters.length === 0 || 
            allowedCompleters.includes(user.id);

          if (!shouldNotify) continue;

          notifiedReminders.current.add(reminder.id);
          persistNotifiedIds();
          await createNotification(reminder);

          // If status is still 'scheduled', update to 'notified' (client-side fallback)
          if (reminder.status === 'scheduled') {
            await supabase
              .from('reminders')
              .update({ status: 'notified' })
              .eq('id', reminder.id)
              .eq('status', 'scheduled');
          }
        }
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }, [user?.id, currentRoom?.id, createNotification, persistNotifiedIds]);

  useEffect(() => {
    if (!user || !currentRoom?.id) return;

    // Check immediately
    checkReminders();

    // Check every 10 seconds (server-side cron handles the actual scheduling)
    checkInterval.current = setInterval(checkReminders, 10000);

    // Subscribe to reminder changes for instant trigger
    const channel = supabase
      .channel('reminder-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reminders',
          filter: `room_id=eq.${currentRoom.id}`
        },
        (payload) => {
          // When server-side cron updates status to 'notified', check immediately
          if (payload.new && (payload.new as any).status === 'notified') {
            setTimeout(checkReminders, 300);
          }
        }
      )
      .subscribe();

    return () => {
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, currentRoom?.id, checkReminders]);

  return { checkReminders };
};
