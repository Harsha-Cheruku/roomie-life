import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from './usePushNotifications';

/**
 * Hook that listens for new notifications in realtime and triggers browser push notifications.
 * Always shows push for the receiver — even when the app is in foreground (WhatsApp-style).
 */
export const useRealtimePushNotifications = () => {
  const { user, currentRoom } = useAuth();
  const { showNotification, isEnabled } = usePushNotifications();

  useEffect(() => {
    if (!user || !currentRoom || !isEnabled) return;

    const channel = supabase
      .channel(`realtime-push-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const notification = payload.new as {
            title: string;
            body?: string;
            type: string;
            reference_type?: string;
            is_read?: boolean;
          };

          // Skip if already read
          if (notification.is_read) return;

          // Always show push notification for the receiver (WhatsApp-style)
          await showNotification(notification.title, {
            body: notification.body || undefined,
            tag: `roomsync-${notification.type}-${Date.now()}`,
            requireInteraction: true,
            data: {
              url: getUrlForNotification(notification.reference_type)
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentRoom, isEnabled, showNotification]);
};

function getUrlForNotification(referenceType?: string): string {
  switch (referenceType) {
    case 'expense':
      return '/expenses';
    case 'task':
      return '/tasks';
    case 'reminder':
      return '/reminders';
    case 'alarm':
      return '/alarms';
    case 'chat':
      return '/chat';
    default:
      return '/';
  }
}
