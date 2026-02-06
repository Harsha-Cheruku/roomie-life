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
      console.log('Creating reminder notification for:', reminder.title);
      
      // Play reminder sound with notification - use multiple attempts for reliability
      const soundPlayed = await playNotificationSound('reminder');
      console.log('Reminder sound played:', soundPlayed);
      
      // Vibrate if supported (for mobile) - do this before notification for better UX
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([300, 100, 300, 100, 300]);
        } catch (e) {
          console.warn('Vibration failed:', e);
        }
      }
      
      // Send browser notification with sound
      sendReminderNotification(reminder.title, reminder.description || 'Reminder is due now!');
      
      // Store notification in database
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
      
      // Show in-app toast as fallback
      toast.success(`⏰ ${reminder.title}`, {
        description: reminder.description || 'Reminder is due now!',
        duration: 10000,
      });
      
      console.log('Reminder notification sent successfully:', reminder.title);
    } catch (error) {
      console.error('Error creating reminder notification:', error);
      // Still show toast even if other notifications fail
      toast.error('Reminder failed to trigger properly');
    }
  };

  const checkReminders = useCallback(async () => {
    if (!user || !currentRoom?.id) return;

    try {
      const now = new Date();
      // Expand window to 2 minutes to catch any timing delays
      const twoMinutesAgo = new Date(now.getTime() - 120000);
      const thirtySecondsAhead = new Date(now.getTime() + 30000);

      console.log('Checking reminders...', { now: now.toISOString() });

      const { data: dueReminders, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('room_id', currentRoom.id)
        .eq('status', 'scheduled')
        .gte('remind_at', twoMinutesAgo.toISOString())
        .lte('remind_at', thirtySecondsAhead.toISOString());

      if (error) throw error;

      console.log('Found due reminders:', dueReminders?.length || 0);

      dueReminders?.forEach((reminder) => {
        // Check if we should notify this user
        const allowedCompleters = reminder.allowed_completers || [];
        const shouldNotify = 
          reminder.created_by === user.id || 
          allowedCompleters.length === 0 || 
          allowedCompleters.includes(user.id);

        if (shouldNotify && !notifiedReminders.current.has(reminder.id)) {
          console.log('Triggering reminder:', reminder.title);
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

    console.log('Reminder notification hook initialized');

    // Check immediately
    checkReminders();

    // Check every 10 seconds for better accuracy (reduced from 15s)
    checkInterval.current = setInterval(checkReminders, 10000);

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