import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, ScheduleOptions } from '@capacitor/local-notifications';

/**
 * Native alarm scheduling using Capacitor Local Notifications.
 * On Android this uses AlarmManager.setExactAndAllowWhileIdle() under the hood.
 * On iOS this uses UNCalendarNotificationTrigger.
 */
export function useNativeAlarm() {
  const isNative = Capacitor.isNativePlatform();

  const requestPermissions = useCallback(async () => {
    if (!isNative) return false;
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (e) {
      console.error('Native alarm permission error:', e);
      return false;
    }
  }, [isNative]);

  const checkPermissions = useCallback(async () => {
    if (!isNative) return false;
    try {
      const result = await LocalNotifications.checkPermissions();
      return result.display === 'granted';
    } catch (e) {
      return false;
    }
  }, [isNative]);

  /**
   * Schedule a native alarm notification at a specific time.
   * Uses exact alarm scheduling on Android (AlarmManager).
   */
  const scheduleAlarm = useCallback(async (opts: {
    id: number;
    title: string;
    body: string;
    scheduleAt: Date;
    sound?: string;
    extra?: Record<string, string>;
  }) => {
    if (!isNative) return false;

    try {
      const hasPermission = await checkPermissions();
      if (!hasPermission) {
        const granted = await requestPermissions();
        if (!granted) return false;
      }

      const scheduleOptions: ScheduleOptions = {
        notifications: [
          {
            id: opts.id,
            title: opts.title,
            body: opts.body,
            schedule: {
              at: opts.scheduleAt,
              allowWhileIdle: true, // Android: uses setExactAndAllowWhileIdle
            },
            sound: opts.sound || 'alarm_sound.wav',
            channelId: 'alarm-channel',
            extra: opts.extra || {},
            ongoing: true,
            autoCancel: false,
          },
        ],
      };

      await LocalNotifications.schedule(scheduleOptions);
      console.log(`Native alarm scheduled: ${opts.title} at ${opts.scheduleAt.toISOString()}`);
      return true;
    } catch (e) {
      console.error('Failed to schedule native alarm:', e);
      return false;
    }
  }, [isNative, checkPermissions, requestPermissions]);

  /**
   * Cancel a scheduled native alarm by ID.
   */
  const cancelAlarm = useCallback(async (id: number) => {
    if (!isNative) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch (e) {
      console.error('Failed to cancel native alarm:', e);
    }
  }, [isNative]);

  /**
   * Cancel all scheduled native alarms.
   */
  const cancelAllAlarms = useCallback(async () => {
    if (!isNative) return;
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }
    } catch (e) {
      console.error('Failed to cancel all native alarms:', e);
    }
  }, [isNative]);

  /**
   * Create the high-importance alarm notification channel (Android only).
   * Must be called once on app startup.
   */
  const createAlarmChannel = useCallback(async () => {
    if (!isNative || Capacitor.getPlatform() !== 'android') return;
    try {
      await LocalNotifications.createChannel({
        id: 'alarm-channel',
        name: 'Alarms',
        description: 'Alarm notifications with sound and vibration',
        importance: 5, // IMPORTANCE_HIGH — heads-up, sound, vibration
        visibility: 1, // PUBLIC
        sound: 'alarm_sound.wav',
        vibration: true,
        lights: true,
      });
      console.log('Android alarm notification channel created');
    } catch (e) {
      console.error('Failed to create alarm channel:', e);
    }
  }, [isNative]);

  /**
   * Register listener for when user taps a notification (to navigate/dismiss).
   */
  const addActionListener = useCallback((handler: (notification: any) => void) => {
    if (!isNative) return () => {};
    const listener = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => handler(action.notification)
    );
    return () => { listener.then(l => l.remove()); };
  }, [isNative]);

  return {
    isNative,
    requestPermissions,
    checkPermissions,
    scheduleAlarm,
    cancelAlarm,
    cancelAllAlarms,
    createAlarmChannel,
    addActionListener,
  };
}
