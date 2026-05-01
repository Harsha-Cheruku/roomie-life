import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import NativeAlarm from '@/plugins/NativeAlarmPlugin';
import { LocalNotifications } from '@capacitor/local-notifications';

const isIOS = () => Capacitor.getPlatform() === 'ios';

/** Stable numeric ID derived from a string alarm id (LocalNotifications requires int IDs). */
const toNotificationId = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  // Keep within 32-bit positive range
  return Math.abs(hash) || 1;
};

const ensureIOSPermission = async () => {
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      return req.display === 'granted';
    }
    return true;
  } catch (e) {
    console.error('LocalNotifications permission error', e);
    return false;
  }
};

/**
 * Hook for native alarm operations via the custom Capacitor AlarmPlugin.
 * Uses AlarmManager + ForegroundService on Android for 100% reliability.
 * Falls back gracefully on web (no-op).
 */
export function useNativeAlarm() {
  const isNative = Capacitor.isNativePlatform();

  const createAlarm = useCallback(async (opts: {
    id?: string;
    title: string;
    hour: number;
    minute: number;
    repeatDaily?: boolean;
    ringtoneUri?: string;
    stopCondition?: string;
    createdBy?: string;
    repeatWeekly?: boolean;
    dayOfWeek?: number;
  }) => {
    if (!isNative) return null;

    // iOS path — we don't have a custom native plugin on iOS. Use the system's
    // LocalNotifications scheduler, which fires reliably while the app is in the
    // background or the device is locked (system-managed, no app process needed).
    if (isIOS()) {
      try {
        const granted = await ensureIOSPermission();
        if (!granted) return null;

        const id = opts.id || `alarm_${Date.now()}`;
        const notificationId = toNotificationId(id);

        // Compute next trigger date for one-shot or fallback usage.
        const now = new Date();
        const next = new Date();
        next.setHours(opts.hour, opts.minute, 0, 0);
        if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);

        const schedule: Record<string, unknown> = { allowWhileIdle: true };
        if (opts.repeatDaily) {
          schedule.on = { hour: opts.hour, minute: opts.minute };
          schedule.repeats = true;
        } else if (opts.repeatWeekly && typeof opts.dayOfWeek === 'number') {
          schedule.on = { weekday: opts.dayOfWeek, hour: opts.hour, minute: opts.minute };
          schedule.repeats = true;
        } else {
          schedule.at = next;
        }

        await LocalNotifications.schedule({
          notifications: [{
            id: notificationId,
            title: opts.title || 'Alarm',
            body: 'Tap to open RoomMate',
            sound: 'alarm_sound.wav',
            schedule,
            extra: { alarmId: id, stopCondition: opts.stopCondition, createdBy: opts.createdBy },
            // Best-effort: ongoing-style on iOS via critical sound; visible on lock screen by default.
            autoCancel: false,
          }],
        });
        console.log(`iOS alarm scheduled: ${opts.title} at ${opts.hour}:${opts.minute}`);
        return id;
      } catch (e) {
        console.error('Failed to schedule iOS alarm:', e);
        return null;
      }
    }

    try {
      const result = await NativeAlarm.createAlarm(opts);
      console.log(`Native alarm created: ${opts.title} at ${opts.hour}:${opts.minute}`);
      return result.alarmId;
    } catch (e) {
      console.error('Failed to create native alarm:', e);
      return null;
    }
  }, [isNative]);

  const stopAlarm = useCallback(async (alarmId?: string) => {
    if (!isNative) return;
    if (isIOS()) {
      try {
        if (alarmId) {
          await LocalNotifications.cancel({ notifications: [{ id: toNotificationId(alarmId) }] });
        }
      } catch (e) {
        console.error('Failed to stop iOS alarm:', e);
      }
      return;
    }
    try {
      await NativeAlarm.stopAlarm({ alarmId });
      console.log('Native alarm stopped');
    } catch (e) {
      console.error('Failed to stop native alarm:', e);
    }
  }, [isNative]);

  const deleteAlarm = useCallback(async (alarmId: string) => {
    if (!isNative) return;
    if (isIOS()) {
      try {
        await LocalNotifications.cancel({ notifications: [{ id: toNotificationId(alarmId) }] });
      } catch (e) {
        console.error('Failed to delete iOS alarm:', e);
      }
      return;
    }
    try {
      await NativeAlarm.deleteAlarm({ alarmId });
      console.log('Native alarm deleted:', alarmId);
    } catch (e) {
      console.error('Failed to delete native alarm:', e);
    }
  }, [isNative]);

  const getAllAlarms = useCallback(async () => {
    if (!isNative) return [];
    if (isIOS()) {
      try {
        const pending = await LocalNotifications.getPending();
        return pending.notifications.map((n) => ({
          id: String((n.extra as { alarmId?: string } | undefined)?.alarmId ?? n.id),
          title: n.title,
          hour: 0, minute: 0,
          repeatDaily: false, ringtoneUri: '',
          stopCondition: 'anyone', createdBy: '',
          isActive: true,
        }));
      } catch (e) {
        return [];
      }
    }
    try {
      const result = await NativeAlarm.getAllAlarms();
      return result.alarms;
    } catch (e) {
      console.error('Failed to get native alarms:', e);
      return [];
    }
  }, [isNative]);

  const checkBatteryOptimization = useCallback(async () => {
    if (!isNative || isIOS()) return false; // iOS has no battery-optimization API
    try {
      const result = await NativeAlarm.checkBatteryOptimization();
      return result.isOptimized;
    } catch (e) {
      return false;
    }
  }, [isNative]);

  const requestDisableBatteryOptimization = useCallback(async () => {
    if (!isNative || isIOS()) return;
    try {
      await NativeAlarm.requestDisableBatteryOptimization();
    } catch (e) {
      console.error('Failed to request battery optimization disable:', e);
    }
  }, [isNative]);

  const requestExactAlarmPermission = useCallback(async () => {
    if (!isNative) return;
    if (isIOS()) {
      // On iOS, "exact alarm" permission == notification permission.
      await ensureIOSPermission();
      return;
    }
    try {
      await NativeAlarm.requestExactAlarmPermission();
    } catch (e) {
      console.error('Failed to request exact alarm permission:', e);
    }
  }, [isNative]);

  return {
    isNative,
    createAlarm,
    stopAlarm,
    deleteAlarm,
    getAllAlarms,
    checkBatteryOptimization,
    requestDisableBatteryOptimization,
    requestExactAlarmPermission,
  };
}
