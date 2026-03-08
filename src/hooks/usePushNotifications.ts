import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface PushNotificationState {
  isSupported: boolean;
  isEnabled: boolean;
  permission: NotificationPermission;
}

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isEnabled: false,
    permission: 'default'
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const isSupported = 'Notification' in window && 'serviceWorker' in navigator;
    const permission = isSupported ? Notification.permission : 'denied';
    setState({
      isSupported,
      isEnabled: permission === 'granted',
      permission
    });
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
      // Use the existing SW registered by vite-plugin-pwa, or fall back to manual
      const registration = await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.error('SW registration failed:', error);
      return null;
    }
  }, []);

  /**
   * Save the push subscription to the database (upsert by user+endpoint).
   */
  const savePushSubscription = useCallback(async (sub: PushSubscription) => {
    if (!user) return;
    const key = sub.getKey('p256dh');
    const auth = sub.getKey('auth');
    if (!key || !auth) return;

    const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)));
    const authStr = btoa(String.fromCharCode(...new Uint8Array(auth)));

    // Upsert — unique index on (user_id, endpoint) prevents duplicates
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh,
          auth: authStr,
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (error) {
      console.error('Failed to save push subscription:', error);
    }
  }, [user]);

  const requestPermission = useCallback(async () => {
    if (!state.isSupported) return false;
    setIsLoading(true);

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({
        ...prev,
        permission,
        isEnabled: permission === 'granted'
      }));

      if (permission === 'granted') {
        const registration = await registerServiceWorker();
        // Try to create a PushManager subscription if supported
        if ((registration as any)?.pushManager) {
          try {
            const existingSub = await (registration as any).pushManager.getSubscription();
            if (existingSub) {
              await savePushSubscription(existingSub);
            }
            // Note: Full PushManager.subscribe() requires VAPID applicationServerKey.
            // Without it, we still get local notification capability via showNotification().
          } catch (e) {
            console.warn('PushManager subscription not available:', e);
          }
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [state.isSupported, registerServiceWorker, savePushSubscription]);

  const showNotification = useCallback(async (title: string, options?: NotificationOptions & { vibrate?: number[] }) => {
    if (!state.isEnabled) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'roomsync-notification',
        requireInteraction: false,
        ...options
      });
      return true;
    } catch (error) {
      try {
        new Notification(title, { icon: '/favicon.ico', ...options });
        return true;
      } catch (e) {
        console.error('Error showing notification:', e);
        return false;
      }
    }
  }, [state.isEnabled]);

  // Auto-register SW + save subscription on mount if already granted
  useEffect(() => {
    if (state.isEnabled && user) {
      registerServiceWorker().then(async (reg) => {
        if ((reg as any)?.pushManager) {
          try {
            const sub = await (reg as any).pushManager.getSubscription();
            if (sub) await savePushSubscription(sub);
          } catch (e) {
            // Ignore
          }
        }
      });
    }
  }, [state.isEnabled, user, registerServiceWorker, savePushSubscription]);

  return {
    ...state,
    isLoading,
    requestPermission,
    showNotification,
    registerServiceWorker
  };
};
