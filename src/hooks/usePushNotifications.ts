import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// VAPID public key (safe to expose). Pair lives in Supabase secrets:
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT — used by the
// `send-push` edge function to deliver real background notifications.
const VAPID_PUBLIC_KEY =
  'BE4XDG5rqOZ0Ez5rF-5Wu3JDN9WJkBGBlpTv_ZKYt1aeO7WHzz4pkwcWv3Op1XIZj08vMKP61iKqgv0gjElOSK0';

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
};

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

  /**
   * Get or create a real PushManager subscription tied to our VAPID key, so
   * the browser/OS can deliver notifications even when the app is closed.
   */
  const ensurePushSubscription = useCallback(
    async (registration: ServiceWorkerRegistration) => {
      const pm = (registration as any).pushManager as PushManager | undefined;
      if (!pm) return null;
      try {
        let sub = await pm.getSubscription();
        if (!sub) {
          sub = await pm.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
          });
        }
        if (sub) await savePushSubscription(sub);
        return sub;
      } catch (e) {
        console.warn('PushManager.subscribe failed:', e);
        return null;
      }
    },
    [savePushSubscription],
  );

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
        if (registration) await ensurePushSubscription(registration);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [state.isSupported, registerServiceWorker, ensurePushSubscription]);

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
      registerServiceWorker().then((reg) => {
        if (reg) ensurePushSubscription(reg);
      });
    }
  }, [state.isEnabled, user, registerServiceWorker, ensurePushSubscription]);

  return {
    ...state,
    isLoading,
    requestPermission,
    showNotification,
    registerServiceWorker
  };
};
