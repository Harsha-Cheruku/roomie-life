import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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
    const checkSupport = () => {
      const isSupported = 'Notification' in window && 'serviceWorker' in navigator;
      const permission = isSupported ? Notification.permission : 'denied';
      
      setState({
        isSupported,
        isEnabled: permission === 'granted',
        permission
      });
    };

    checkSupport();
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!state.isSupported) {
      console.log('Push notifications not supported');
      return false;
    }

    setIsLoading(true);

    try {
      const permission = await Notification.requestPermission();
      
      setState(prev => ({
        ...prev,
        permission,
        isEnabled: permission === 'granted'
      }));

      if (permission === 'granted') {
        await registerServiceWorker();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [state.isSupported, registerServiceWorker]);

  const showNotification = useCallback(async (title: string, options?: NotificationOptions & { vibrate?: number[] }) => {
    if (!state.isEnabled) {
      console.log('Notifications not enabled');
      return false;
    }

    try {
      // Try to use service worker for notifications (works in background)
      const registration = await navigator.serviceWorker.ready;
      const notificationOptions: NotificationOptions = {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'roomsync-notification',
        requireInteraction: false,
        ...options
      };
      await registration.showNotification(title, notificationOptions);
      return true;
    } catch (error) {
      // Fallback to regular notification
      console.log('Falling back to regular notification');
      try {
        new Notification(title, {
          icon: '/favicon.ico',
          ...options
        });
        return true;
      } catch (e) {
        console.error('Error showing notification:', e);
        return false;
      }
    }
  }, [state.isEnabled]);

  // Auto-register service worker on mount if already granted
  useEffect(() => {
    if (state.isEnabled && user) {
      registerServiceWorker();
    }
  }, [state.isEnabled, user, registerServiceWorker]);

  return {
    ...state,
    isLoading,
    requestPermission,
    showNotification,
    registerServiceWorker
  };
};
