import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from './usePushNotifications';

/**
 * Hook that listens for new notifications in realtime and triggers browser push notifications
 */
export const useRealtimePushNotifications = () => {
  const { user, currentRoom } = useAuth();
  const { showNotification, isEnabled } = usePushNotifications();

  useEffect(() => {
    if (!user || !currentRoom || !isEnabled) return;

    const channel = supabase
      .channel('realtime-push-notifications')
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
          };

          // Only show push notification if app is not in focus
          if (document.hidden) {
            await showNotification(notification.title, {
              body: notification.body || undefined,
              tag: `roomsync-${notification.type}`,
              data: {
                url: getUrlForNotification(notification.reference_type)
              }
            });
          }
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
