package app.lovable.roommate.alarm

import android.content.Intent
import android.net.Uri
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NativeAlarm")
class AlarmPlugin : Plugin() {

    override fun load() {
        AlarmHelper.init(context)
    }

    @PluginMethod
    fun createAlarm(call: PluginCall) {
        val id = call.getString("id") ?: System.currentTimeMillis().toString()
        val title = call.getString("title") ?: "Alarm"
        val timeHour = call.getInt("hour", 7)!!
        val timeMinute = call.getInt("minute", 0)!!
        val repeatDaily = call.getBoolean("repeatDaily", false)!!
        val repeatWeekly = call.getBoolean("repeatWeekly", false)!!
        val dayOfWeek = call.getInt("dayOfWeek", -1)!!
        val ringtoneUri = call.getString("ringtoneUri")
        val stopCondition = call.getString("stopCondition", "anyone")!!
        val createdBy = call.getString("createdBy") ?: ""

        val alarm = AlarmData(
            id = id,
            title = title,
            hour = timeHour,
            minute = timeMinute,
            repeatDaily = repeatDaily,
            ringtoneUri = ringtoneUri,
            stopCondition = stopCondition,
            createdBy = createdBy,
            isActive = true,
            repeatWeekly = repeatWeekly,
            dayOfWeek = dayOfWeek
        )

        AlarmHelper.saveAlarm(context, alarm)
        AlarmHelper.scheduleAlarm(context, alarm)

        val result = JSObject()
        result.put("success", true)
        result.put("alarmId", id)
        call.resolve(result)
    }

    @PluginMethod
    fun stopAlarm(call: PluginCall) {
        val alarmId = call.getString("alarmId")
        val intent = Intent(context, AlarmService::class.java).apply {
            action = AlarmService.ACTION_STOP
            if (alarmId != null) putExtra("alarm_id", alarmId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)

        val result = JSObject()
        result.put("success", true)
        call.resolve(result)
    }

    @PluginMethod
    fun deleteAlarm(call: PluginCall) {
        val alarmId = call.getString("alarmId") ?: run {
            call.reject("alarmId is required")
            return
        }

        AlarmHelper.cancelAlarm(context, alarmId)
        AlarmHelper.removeAlarm(context, alarmId)

        val result = JSObject()
        result.put("success", true)
        call.resolve(result)
    }

    @PluginMethod
    fun getAllAlarms(call: PluginCall) {
        val alarms = AlarmHelper.getAllAlarms(context)
        val arr = JSArray()
        for (alarm in alarms) {
            val obj = JSObject()
            obj.put("id", alarm.id)
            obj.put("title", alarm.title)
            obj.put("hour", alarm.hour)
            obj.put("minute", alarm.minute)
            obj.put("repeatDaily", alarm.repeatDaily)
            obj.put("ringtoneUri", alarm.ringtoneUri ?: "")
            obj.put("stopCondition", alarm.stopCondition)
            obj.put("createdBy", alarm.createdBy)
            obj.put("isActive", alarm.isActive)
            obj.put("repeatWeekly", alarm.repeatWeekly)
            obj.put("dayOfWeek", alarm.dayOfWeek)
            arr.put(obj)
        }
        val result = JSObject()
        result.put("alarms", arr)
        call.resolve(result)
    }

    @PluginMethod
    fun checkBatteryOptimization(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
            val isIgnoring = pm.isIgnoringBatteryOptimizations(context.packageName)
            result.put("isOptimized", !isIgnoring)
        } else {
            result.put("isOptimized", false)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun requestDisableBatteryOptimization(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                call.resolve(JSObject().put("success", true))
            } catch (e: Exception) {
                call.reject("Failed: ${e.message}")
            }
        } else {
            call.resolve(JSObject().put("success", true))
        }
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                if (alarmManager.canScheduleExactAlarms()) {
                    call.resolve(JSObject().put("success", true).put("alreadyGranted", true))
                    return
                }
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                call.resolve(JSObject().put("success", true))
            } catch (e: Exception) {
                call.reject("Failed: ${e.message}")
            }
        } else {
            call.resolve(JSObject().put("success", true))
        }
    }

    @PluginMethod
    fun getAlarmPermissionStatus(call: PluginCall) {
        val result = JSObject()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            result.put("exactAlarmGranted", alarmManager.canScheduleExactAlarms())
        } else {
            result.put("exactAlarmGranted", true)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun getDiagnostics(call: PluginCall) {
        val result = JSObject()
        val pkg = context.packageName

        // Notifications enabled (app-level)
        val notifsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        result.put("notificationsEnabled", notifsEnabled)

        // Notification channel state
        var channelImportance = -1
        var channelSoundOk = true
        var channelBypassDnd = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Ensure channel exists so we can read its real settings
            AlarmService.createNotificationChannel(context)
            val nm = context.getSystemService(NotificationManager::class.java)
            val ch: NotificationChannel? = nm.getNotificationChannel(AlarmService.CHANNEL_ID)
            if (ch != null) {
                channelImportance = ch.importance
                channelBypassDnd = ch.canBypassDnd()
                // Channel is intentionally silent (service plays sound). Only flag if user manually disabled.
                channelSoundOk = ch.importance >= NotificationManager.IMPORTANCE_DEFAULT
            }
        } else {
            channelImportance = 4
        }
        result.put("channelImportance", channelImportance)
        result.put("channelSoundOk", channelSoundOk)
        result.put("channelBypassDnd", channelBypassDnd)

        // Exact alarm
        var exactAlarm = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            exactAlarm = am.canScheduleExactAlarms()
        }
        result.put("exactAlarmGranted", exactAlarm)

        // Battery optimization
        var ignoringBattery = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            ignoringBattery = pm.isIgnoringBatteryOptimizations(pkg)
        }
        result.put("ignoringBatteryOptimization", ignoringBattery)

        // Overlay
        val canOverlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(context) else true
        result.put("canDrawOverlays", canOverlay)

        // Scheduled alarm count
        result.put("scheduledAlarmCount", AlarmHelper.getAllAlarms(context).count { it.isActive })

        result.put("manufacturer", Build.MANUFACTURER ?: "")
        result.put("brand", Build.BRAND ?: "")
        result.put("model", Build.MODEL ?: "")
        result.put("sdkInt", Build.VERSION.SDK_INT)
        result.put("packageName", pkg)
        result.put("hasAutostartIntent", resolveAutostartIntent() != null)

        call.resolve(result)
    }

    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            openAppDetails()
            call.resolve(JSObject().put("success", true).put("fallback", true))
        }
    }

    @PluginMethod
    fun openChannelSettings(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AlarmService.createNotificationChannel(context)
                val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    putExtra(Settings.EXTRA_CHANNEL_ID, AlarmService.CHANNEL_ID)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } else {
                openAppDetails()
            }
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            openAppDetails()
            call.resolve(JSObject().put("success", true).put("fallback", true))
        }
    }

    @PluginMethod
    fun openOverlaySettings(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                context.startActivity(intent)
            }
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            openAppDetails()
            call.resolve(JSObject().put("success", true).put("fallback", true))
        }
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        openAppDetails()
        call.resolve(JSObject().put("success", true))
    }

    @PluginMethod
    fun openAutostartSettings(call: PluginCall) {
        val intent = resolveAutostartIntent()
        if (intent != null) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                call.resolve(JSObject().put("success", true))
                return
            } catch (_: Exception) { /* fall through */ }
        }
        openAppDetails()
        call.resolve(JSObject().put("success", true).put("fallback", true))
    }

    @PluginMethod
    fun scheduleTestAlarm(call: PluginCall) {
        val minutes = call.getInt("minutes", 2) ?: 2
        val cal = java.util.Calendar.getInstance()
        cal.add(java.util.Calendar.MINUTE, minutes)
        val id = "test_alarm_${System.currentTimeMillis()}"
        val alarm = AlarmData(
            id = id,
            title = "🔔 RoomMate Test Alarm",
            hour = cal.get(java.util.Calendar.HOUR_OF_DAY),
            minute = cal.get(java.util.Calendar.MINUTE),
            repeatDaily = false,
            ringtoneUri = null,
            stopCondition = "anyone",
            createdBy = "wizard_test",
            isActive = true,
            repeatWeekly = false,
            dayOfWeek = -1
        )
        AlarmHelper.saveAlarm(context, alarm)
        AlarmHelper.scheduleAlarm(context, alarm)
        val result = JSObject()
        result.put("success", true)
        result.put("alarmId", id)
        result.put("hour", alarm.hour)
        result.put("minute", alarm.minute)
        call.resolve(result)
    }

    private fun openAppDetails() {
        try {
            val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(i)
        } catch (_: Exception) {}
    }

    /** Best-effort autostart screens for OEM skins that aggressively kill background apps. */
    private fun resolveAutostartIntent(): Intent? {
        val candidates = listOf(
            // Xiaomi / MIUI
            ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            // Oppo / ColorOS
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
            ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
            // Vivo / Funtouch / OriginOS
            ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
            // Realme
            ComponentName("com.coloros.safecenter", "com.coloros.privacypermissionsentry.PermissionTopActivity"),
            // Huawei / Honor
            ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
            // Samsung
            ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
            // Letv / Asus / Honor extras
            ComponentName("com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"),
            ComponentName("com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity")
        )
        val pm = context.packageManager
        for (cn in candidates) {
            val intent = Intent().apply { component = cn; addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            if (intent.resolveActivity(pm) != null) return intent
        }
        return null
    }
}
