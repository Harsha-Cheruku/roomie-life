import { registerPlugin } from '@capacitor/core';

export interface NativeAlarmPlugin {
  createAlarm(options: {
    id?: string;
    title: string;
    hour: number;
    minute: number;
    repeatDaily?: boolean;
    ringtoneUri?: string;
    stopCondition?: string; // "anyone" | "owner_only"
    createdBy?: string;
    repeatWeekly?: boolean;
    dayOfWeek?: number; // 1=Sun..7=Sat
  }): Promise<{ success: boolean; alarmId: string }>;

  stopAlarm(options: { alarmId?: string }): Promise<{ success: boolean }>;

  deleteAlarm(options: { alarmId: string }): Promise<{ success: boolean }>;

  getAllAlarms(): Promise<{
    alarms: Array<{
      id: string;
      title: string;
      hour: number;
      minute: number;
      repeatDaily: boolean;
      ringtoneUri: string;
      stopCondition: string;
      createdBy: string;
      isActive: boolean;
    }>;
  }>;

  checkBatteryOptimization(): Promise<{ isOptimized: boolean }>;

  requestDisableBatteryOptimization(): Promise<{ success: boolean }>;

  requestExactAlarmPermission(): Promise<{ success: boolean }>;

  getAlarmPermissionStatus(): Promise<{ exactAlarmGranted: boolean }>;

  getDiagnostics(): Promise<{
    notificationsEnabled: boolean;
    channelImportance: number; // 0=none,1=min,2=low,3=default,4=high,5=max
    channelSoundOk: boolean;
    channelBypassDnd: boolean;
    exactAlarmGranted: boolean;
    ignoringBatteryOptimization: boolean;
    canDrawOverlays: boolean;
    scheduledAlarmCount: number;
    manufacturer: string;
    brand: string;
    model: string;
    sdkInt: number;
    packageName: string;
    hasAutostartIntent: boolean;
  }>;

  openNotificationSettings(): Promise<{ success: boolean }>;
  openChannelSettings(): Promise<{ success: boolean }>;
  openOverlaySettings(): Promise<{ success: boolean }>;
  openAppSettings(): Promise<{ success: boolean }>;
  openAutostartSettings(): Promise<{ success: boolean; fallback?: boolean }>;
  scheduleTestAlarm(options: { minutes?: number }): Promise<{ success: boolean; alarmId: string; hour: number; minute: number }>;
}

const NativeAlarm = registerPlugin<NativeAlarmPlugin>('NativeAlarm');

export default NativeAlarm;
