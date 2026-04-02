package app.lovable.roommate.alarm

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that plays alarm sound continuously, vibrates,
 * acquires a WakeLock, and shows a high-priority notification.
 */
class AlarmService : Service() {

    companion object {
        const val TAG = "AlarmService"
        const val ACTION_START = "app.lovable.roommate.alarm.START"
        const val ACTION_STOP = "app.lovable.roommate.alarm.STOP"
        const val CHANNEL_ID = "roommate_alarm_channel"
        const val NOTIFICATION_ID = 9999

        fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Alarm Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Alarm ringing notifications"
                    setBypassDnd(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 800, 200, 800, 200, 800)
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                }
                val nm = context.getSystemService(NotificationManager::class.java)
                nm.createNotificationChannel(channel)
            }
        }
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var volumeRampHandler: Handler? = null
    private var currentAlarmId: String? = null

    override fun onBind(intent: Intent?) = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopAlarmImmediately()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val alarmId = intent.getStringExtra("alarm_id") ?: ""
                val title = intent.getStringExtra("alarm_title") ?: "Alarm"
                val ringtoneUri = intent.getStringExtra("ringtone_uri") ?: ""

                currentAlarmId = alarmId
                startForeground(NOTIFICATION_ID, buildNotification(title))
                acquireWakeLock()
                startRinging(ringtoneUri)
                startVibration()
            }
        }
        return START_STICKY
    }

    private fun buildNotification(title: String): Notification {
        // Intent to open the app when notification is tapped
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("alarm_ringing", true)
            putExtra("alarm_id", currentAlarmId)
        }
        val pendingLaunch = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Stop action button
        val stopIntent = Intent(this, AlarmService::class.java).apply {
            action = ACTION_STOP
        }
        val pendingStop = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🔔 $title")
            .setContentText("Alarm is ringing! Tap to open.")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pendingLaunch)
            .setFullScreenIntent(pendingLaunch, true) // Shows on lock screen
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "STOP", pendingStop)
            .build()
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "roommate:alarm_wakelock"
        )
        wakeLock?.acquire(10 * 60 * 1000L) // 10 min max
    }

    private fun startRinging(ringtoneUri: String) {
        try {
            mediaPlayer?.release()

            val uri: Uri = when {
                ringtoneUri.isNotEmpty() && ringtoneUri != "default" -> {
                    try { Uri.parse(ringtoneUri) } catch (e: Exception) {
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    }
                }
                else -> RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            }

            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(this@AlarmService, uri)
                isLooping = true
                setVolume(0.3f, 0.3f) // Start low
                prepare()
                start()
            }

            // Ensure alarm stream is at max volume
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            audioManager.setStreamVolume(AudioManager.STREAM_ALARM, maxVol, 0)

            // Volume ramp: 0.3 → 1.0 over 30 seconds
            startVolumeRamp()

            Log.d(TAG, "Alarm ringing with URI: $uri")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play alarm sound, using fallback", e)
            playFallbackRingtone()
        }
    }

    private fun playFallbackRingtone() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                ?: return

            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(this@AlarmService, uri)
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Fallback ringtone also failed", e)
        }
    }

    private fun startVolumeRamp() {
        volumeRampHandler = Handler(Looper.getMainLooper())
        val startTime = System.currentTimeMillis()
        val rampDuration = 30_000L // 30 seconds

        val rampRunnable = object : Runnable {
            override fun run() {
                val elapsed = System.currentTimeMillis() - startTime
                val progress = (elapsed.toFloat() / rampDuration).coerceIn(0f, 1f)
                val volume = 0.3f + (0.7f * progress)
                mediaPlayer?.setVolume(volume, volume)

                if (progress < 1f) {
                    volumeRampHandler?.postDelayed(this, 500)
                }
            }
        }
        volumeRampHandler?.postDelayed(rampRunnable, 500)
    }

    private fun startVibration() {
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        val pattern = longArrayOf(0, 800, 200, 800, 200, 800, 500)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(
                VibrationEffect.createWaveform(pattern, 0), // 0 = repeat from index 0
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build()
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 0)
        }
    }

    private fun stopAlarmImmediately() {
        Log.d(TAG, "Stopping alarm immediately")

        volumeRampHandler?.removeCallbacksAndMessages(null)
        volumeRampHandler = null

        mediaPlayer?.let {
            try { it.stop() } catch (_: Exception) {}
            try { it.release() } catch (_: Exception) {}
        }
        mediaPlayer = null

        vibrator?.cancel()
        vibrator = null

        wakeLock?.let {
            if (it.isHeld) try { it.release() } catch (_: Exception) {}
        }
        wakeLock = null

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopAlarmImmediately()
        super.onDestroy()
    }
}
