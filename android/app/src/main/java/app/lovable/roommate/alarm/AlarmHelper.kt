package app.lovable.roommate.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Handles alarm scheduling via AlarmManager and persistent storage via SharedPreferences.
 * Uses setExactAndAllowWhileIdle for Doze-mode reliability.
 */
object AlarmHelper {

    private const val TAG = "AlarmHelper"
    private const val PREFS_NAME = "roommate_alarms"
    private const val KEY_ALARMS = "alarms_json"

    fun init(context: Context) {
        AlarmService.createNotificationChannel(context)
    }

    // ---- Scheduling ----

    fun scheduleAlarm(context: Context, alarm: AlarmData) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerTime = if (alarm.repeatWeekly && alarm.dayOfWeek in 1..7)
            getNextTriggerTimeMillisForDay(alarm.hour, alarm.minute, alarm.dayOfWeek)
        else
            getNextTriggerTimeMillis(alarm.hour, alarm.minute)

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "app.lovable.roommate.ALARM_TRIGGER"
            putExtra("alarm_id", alarm.id)
            putExtra("alarm_title", alarm.title)
            putExtra("alarm_hour", alarm.hour)
            putExtra("alarm_minute", alarm.minute)
            putExtra("repeat_daily", alarm.repeatDaily)
            putExtra("repeat_weekly", alarm.repeatWeekly)
            putExtra("day_of_week", alarm.dayOfWeek)
            putExtra("ringtone_uri", alarm.ringtoneUri ?: "")
            putExtra("stop_condition", alarm.stopCondition)
            putExtra("created_by", alarm.createdBy)
        }

        val requestCode = alarm.id.hashCode()
        val pendingIntent = PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setAlarmClock(
                        AlarmManager.AlarmClockInfo(triggerTime, pendingIntent),
                        pendingIntent
                    )
                } else {
                    // Fallback if exact alarm permission not granted
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                    )
                }
            } else {
                alarmManager.setAlarmClock(
                    AlarmManager.AlarmClockInfo(triggerTime, pendingIntent),
                    pendingIntent
                )
            }
            Log.d(TAG, "Alarm scheduled: ${alarm.title} at ${alarm.hour}:${String.format("%02d", alarm.minute)}, trigger=$triggerTime")
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException — falling back to inexact", e)
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
            )
        }
    }

    fun cancelAlarm(context: Context, alarmId: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "app.lovable.roommate.ALARM_TRIGGER"
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, alarmId.hashCode(), intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        pendingIntent?.let { alarmManager.cancel(it) }
        Log.d(TAG, "Alarm cancelled: $alarmId")
    }

    fun rescheduleAllAlarms(context: Context) {
        val alarms = getAllAlarms(context)
        for (alarm in alarms) {
            if (alarm.isActive) {
                scheduleAlarm(context, alarm)
            }
        }
        Log.d(TAG, "Rescheduled ${alarms.count { it.isActive }} active alarms after boot")
    }

    private fun getNextTriggerTimeMillis(hour: Int, minute: Int): Long {
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (cal.timeInMillis <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }
        return cal.timeInMillis
    }

    /** Next occurrence of given dayOfWeek (1=Sun..7=Sat) at hour:minute. */
    private fun getNextTriggerTimeMillisForDay(hour: Int, minute: Int, dayOfWeek: Int): Long {
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        var daysAhead = (dayOfWeek - cal.get(Calendar.DAY_OF_WEEK) + 7) % 7
        if (daysAhead == 0 && cal.timeInMillis <= System.currentTimeMillis()) daysAhead = 7
        cal.add(Calendar.DAY_OF_YEAR, daysAhead)
        return cal.timeInMillis
    }

    // ---- Persistent Storage ----

    fun saveAlarm(context: Context, alarm: AlarmData) {
        val alarms = getAllAlarms(context).toMutableList()
        alarms.removeAll { it.id == alarm.id }
        alarms.add(alarm)
        saveAllAlarms(context, alarms)
    }

    fun removeAlarm(context: Context, alarmId: String) {
        val alarms = getAllAlarms(context).toMutableList()
        alarms.removeAll { it.id == alarmId }
        saveAllAlarms(context, alarms)
    }

    fun getAllAlarms(context: Context): List<AlarmData> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val json = prefs.getString(KEY_ALARMS, "[]") ?: "[]"
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).map { i ->
                val obj = arr.getJSONObject(i)
                AlarmData(
                    id = obj.getString("id"),
                    title = obj.optString("title", "Alarm"),
                    hour = obj.getInt("hour"),
                    minute = obj.getInt("minute"),
                    repeatDaily = obj.optBoolean("repeatDaily", false),
                    ringtoneUri = obj.optString("ringtoneUri", null),
                    stopCondition = obj.optString("stopCondition", "anyone"),
                    createdBy = obj.optString("createdBy", ""),
                    isActive = obj.optBoolean("isActive", true),
                    repeatWeekly = obj.optBoolean("repeatWeekly", false),
                    dayOfWeek = obj.optInt("dayOfWeek", -1)
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing alarms", e)
            emptyList()
        }
    }

    private fun saveAllAlarms(context: Context, alarms: List<AlarmData>) {
        val arr = JSONArray()
        for (a in alarms) {
            arr.put(JSONObject().apply {
                put("id", a.id)
                put("title", a.title)
                put("hour", a.hour)
                put("minute", a.minute)
                put("repeatDaily", a.repeatDaily)
                put("ringtoneUri", a.ringtoneUri ?: "")
                put("stopCondition", a.stopCondition)
                put("createdBy", a.createdBy)
                put("isActive", a.isActive)
                put("repeatWeekly", a.repeatWeekly)
                put("dayOfWeek", a.dayOfWeek)
            })
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ALARMS, arr.toString())
            .apply()
    }
}
