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
}

const NativeAlarm = registerPlugin<NativeAlarmPlugin>('NativeAlarm');

export default NativeAlarm;
