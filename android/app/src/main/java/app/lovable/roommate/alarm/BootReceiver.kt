package app.lovable.roommate.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Re-schedules all saved alarms after device reboot.
 * Registered in AndroidManifest for BOOT_COMPLETED.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON" ||
            intent.action == "com.htc.intent.action.QUICKBOOT_POWERON") {
            Log.d(TAG, "Device booted — rescheduling all alarms")
            AlarmHelper.init(context)
            AlarmHelper.rescheduleAllAlarms(context)
        }
    }
}
