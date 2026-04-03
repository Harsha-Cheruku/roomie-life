package app.lovable.roommate.alarm

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Full-screen alarm activity that shows over lock screen.
 * Big STOP button for instant dismiss. No JS dependency.
 */
class AlarmActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "AlarmActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "AlarmActivity created")

        // Show over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            km.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val alarmId = intent.getStringExtra("alarm_id") ?: ""
        val title = intent.getStringExtra("alarm_title") ?: "Alarm"

        // Build UI programmatically (no XML layout needed)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(0xFF1A1A2E.toInt())
            setPadding(48, 48, 48, 48)
        }

        val alarmIcon = TextView(this).apply {
            text = "🔔"
            textSize = 72f
            gravity = android.view.Gravity.CENTER
        }

        val titleText = TextView(this).apply {
            text = title
            textSize = 32f
            setTextColor(0xFFFFFFFF.toInt())
            gravity = android.view.Gravity.CENTER
            setPadding(0, 32, 0, 16)
        }

        val subtitleText = TextView(this).apply {
            text = "Alarm is ringing!"
            textSize = 18f
            setTextColor(0xAAFFFFFF.toInt())
            gravity = android.view.Gravity.CENTER
            setPadding(0, 0, 0, 64)
        }

        val stopButton = Button(this).apply {
            text = "STOP"
            textSize = 24f
            setTextColor(0xFFFFFFFF.toInt())
            setBackgroundColor(0xFFEF4444.toInt())
            setPadding(64, 32, 64, 32)
            minimumHeight = 160

            setOnClickListener {
                Log.d(TAG, "STOP pressed — killing alarm instantly")
                // Stop foreground service immediately — no JS, no network
                val stopIntent = Intent(this@AlarmActivity, AlarmService::class.java).apply {
                    action = AlarmService.ACTION_STOP
                    putExtra("alarm_id", alarmId)
                }
                startService(stopIntent)
                finish()
            }
        }

        val buttonParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            setMargins(48, 0, 48, 0)
        }

        layout.addView(alarmIcon)
        layout.addView(titleText)
        layout.addView(subtitleText)
        layout.addView(stopButton, buttonParams)

        setContentView(layout)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onBackPressed() {
        // Prevent dismissing alarm with back button
        // User must press STOP
    }
}
