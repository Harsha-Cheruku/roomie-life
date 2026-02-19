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

  const createNotification = useCallback(async (reminder: Reminder) => {
    if (!user || !currentRoom) return;

    try {
      console.log('Creating reminder notification for:', reminder.title);
      
      // Play sound with multiple attempts
      try {
        await playNotificationSound('reminder');
      } catch (e) {
        console.warn('Sound failed, retrying...', e);
        setTimeout(() => playNotificationSound('reminder').catch(() => {}), 500);
      }
      
      // Vibrate
      if ('vibrate' in navigator) {
        try { navigator.vibrate([300, 100, 300, 100, 300]); } catch (e) {}
      }
      
      // Browser notification
      sendReminderNotification(reminder.title, reminder.description || 'Reminder is due now!');
      
      // Store in DB
      await supabase
        .from('notifications')
        .insert({
          user_id: user.id,
          room_id: currentRoom.id,
          type: 'reminder',
          title: '⏰ Reminder',
          body: reminder.title,
          reference_type: 'reminder',
          reference_id: reminder.id,
          is_read: false,
        });

      // Update status
      await supabase
        .from('reminders')
        .update({ status: 'notified' })
        .eq('id', reminder.id)
        .eq('status', 'scheduled');
      
      // In-app toast fallback
      toast.success(`⏰ ${reminder.title}`, {
        description: reminder.description || 'Reminder is due now!',
        duration: 15000,
      });
      
      console.log('Reminder notification sent successfully:', reminder.title);
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
      const now = new Date();
      // Check window: 3 minutes ago to 30 seconds ahead
      const windowStart = new Date(now.getTime() - 180000);
      const windowEnd = new Date(now.getTime() + 30000);

      console.log('Checking reminders...', { now: now.toISOString() });

      const { data: dueReminders, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('room_id', currentRoom.id)
        .eq('status', 'scheduled')
        .gte('remind_at', windowStart.toISOString())
        .lte('remind_at', windowEnd.toISOString());

      if (error) throw error;

      console.log('Found due reminders:', dueReminders?.length || 0);

      if (dueReminders) {
        for (const reminder of dueReminders) {
          const allowedCompleters = reminder.allowed_completers || [];
          const shouldNotify = 
            reminder.created_by === user.id || 
            allowedCompleters.length === 0 || 
            allowedCompleters.includes(user.id);

          if (shouldNotify && !notifiedReminders.current.has(reminder.id)) {
            console.log('Triggering reminder:', reminder.title);
            notifiedReminders.current.add(reminder.id);
            await createNotification(reminder);
          }
        }
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }, [user?.id, currentRoom?.id, createNotification]);

  useEffect(() => {
    if (!user || !currentRoom?.id) return;

    console.log('Reminder notification hook initialized');

    // Check immediately
    checkReminders();

    // Check every 5 seconds for maximum reliability
    checkInterval.current = setInterval(checkReminders, 5000);

    // Subscribe to new/updated reminders for instant trigger
    const channel = supabase
      .channel('reminder-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reminders',
          filter: `room_id=eq.${currentRoom.id}`
        },
        () => {
          // Small delay to let DB settle, then check
          setTimeout(checkReminders, 500);
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
