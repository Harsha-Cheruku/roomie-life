package app.lovable.roommate.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * BroadcastReceiver triggered by AlarmManager.
 * Immediately starts the AlarmService as a foreground service.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Alarm triggered! Action: ${intent.action}")

        val alarmId = intent.getStringExtra("alarm_id") ?: return
        val title = intent.getStringExtra("alarm_title") ?: "Alarm"
        val hour = intent.getIntExtra("alarm_hour", 0)
        val minute = intent.getIntExtra("alarm_minute", 0)
        val repeatDaily = intent.getBooleanExtra("repeat_daily", false)
        val ringtoneUri = intent.getStringExtra("ringtone_uri") ?: ""
        val stopCondition = intent.getStringExtra("stop_condition") ?: "anyone"
        val createdBy = intent.getStringExtra("created_by") ?: ""

        // Start the foreground alarm service
        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            action = AlarmService.ACTION_START
            putExtra("alarm_id", alarmId)
            putExtra("alarm_title", title)
            putExtra("ringtone_uri", ringtoneUri)
            putExtra("stop_condition", stopCondition)
            putExtra("created_by", createdBy)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        // If repeating, reschedule for tomorrow
        if (repeatDaily) {
            val alarm = AlarmData(
                id = alarmId,
                title = title,
                hour = hour,
                minute = minute,
                repeatDaily = true,
                ringtoneUri = ringtoneUri,
                stopCondition = stopCondition,
                createdBy = createdBy,
                isActive = true
            )
            AlarmHelper.scheduleAlarm(context, alarm)
            Log.d(TAG, "Repeating alarm rescheduled for tomorrow")
        }
    }
}
