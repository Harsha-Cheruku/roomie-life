package app.lovable.roommate.alarm

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
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
            isActive = true
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
        // Stop the foreground service immediately
        val intent = Intent(context, AlarmService::class.java).apply {
            action = AlarmService.ACTION_STOP
            if (alarmId != null) putExtra("alarm_id", alarmId)
        }
        context.startService(intent)

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
                call.reject("Failed to open battery settings: ${e.message}")
            }
        } else {
            call.resolve(JSObject().put("success", true))
        }
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                call.resolve(JSObject().put("success", true))
            } catch (e: Exception) {
                call.reject("Failed to open alarm settings: ${e.message}")
            }
        } else {
            call.resolve(JSObject().put("success", true))
        }
    }
}
