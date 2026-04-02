import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import NativeAlarm from '@/plugins/NativeAlarmPlugin';

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
  }) => {
    if (!isNative) return null;
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
    try {
      await NativeAlarm.stopAlarm({ alarmId });
      console.log('Native alarm stopped');
    } catch (e) {
      console.error('Failed to stop native alarm:', e);
    }
  }, [isNative]);

  const deleteAlarm = useCallback(async (alarmId: string) => {
    if (!isNative) return;
    try {
      await NativeAlarm.deleteAlarm({ alarmId });
      console.log('Native alarm deleted:', alarmId);
    } catch (e) {
      console.error('Failed to delete native alarm:', e);
    }
  }, [isNative]);

  const getAllAlarms = useCallback(async () => {
    if (!isNative) return [];
    try {
      const result = await NativeAlarm.getAllAlarms();
      return result.alarms;
    } catch (e) {
      console.error('Failed to get native alarms:', e);
      return [];
    }
  }, [isNative]);

  const checkBatteryOptimization = useCallback(async () => {
    if (!isNative) return false;
    try {
      const result = await NativeAlarm.checkBatteryOptimization();
      return result.isOptimized;
    } catch (e) {
      return false;
    }
  }, [isNative]);

  const requestDisableBatteryOptimization = useCallback(async () => {
    if (!isNative) return;
    try {
      await NativeAlarm.requestDisableBatteryOptimization();
    } catch (e) {
      console.error('Failed to request battery optimization disable:', e);
    }
  }, [isNative]);

  const requestExactAlarmPermission = useCallback(async () => {
    if (!isNative) return;
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
