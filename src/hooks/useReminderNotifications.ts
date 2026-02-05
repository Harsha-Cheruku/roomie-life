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
}

export const useReminderNotifications = () => {
  const { user, currentRoom } = useAuth();
  const notifiedReminders = useRef<Set<string>>(new Set());
  const checkInterval = useRef<NodeJS.Timeout | null>(null);
  const { sendReminderNotification, playNotificationSound, hasPermission } = useNotifications();

  const createNotification = async (reminder: Reminder) => {
    if (!user || !currentRoom) return;

    try {
      // Play reminder sound with notification
      playNotificationSound('reminder');
      
      // Send browser notification with sound
      sendReminderNotification(reminder.title, reminder.description || 'Reminder is due now!');
      
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

      // Update reminder status to notified
      await supabase
        .from('reminders')
        .update({ status: 'notified' })
        .eq('id', reminder.id);

      // Vibrate if supported (for mobile)
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch (e) {
          // Ignore vibration errors
        }
      }
      
      console.log('Reminder notification sent:', reminder.title);
    } catch (error) {
      console.error('Error creating reminder notification:', error);
    }
  };

  const checkReminders = useCallback(async () => {
    if (!user || !currentRoom?.id) return;

    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);
      const oneMinuteAhead = new Date(now.getTime() + 60000);

      const { data: dueReminders, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('room_id', currentRoom.id)
        .eq('status', 'scheduled')
        .gte('remind_at', oneMinuteAgo.toISOString())
        .lte('remind_at', oneMinuteAhead.toISOString());

      if (error) throw error;

      dueReminders?.forEach((reminder) => {
        // Check if we should notify this user
        const allowedCompleters = reminder.allowed_completers || [];
        const shouldNotify = 
          reminder.created_by === user.id || 
          allowedCompleters.length === 0 || 
          allowedCompleters.includes(user.id);

        if (shouldNotify && !notifiedReminders.current.has(reminder.id)) {
          notifiedReminders.current.add(reminder.id);
          createNotification(reminder);
        }
      });
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }, [user?.id, currentRoom?.id]);

  useEffect(() => {
    if (!user || !currentRoom?.id) return;

    // Check immediately
    checkReminders();

    // Check every 15 seconds for better accuracy
    checkInterval.current = setInterval(checkReminders, 15000);

    // Subscribe to new reminders
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
        () => checkReminders()
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