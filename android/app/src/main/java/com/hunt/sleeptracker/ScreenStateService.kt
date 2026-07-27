package com.hunt.sleeptracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Foreground service that owns a runtime-registered [BroadcastReceiver] for
 * SCREEN_ON / SCREEN_OFF / USER_PRESENT.
 *
 * Only [Intent.ACTION_USER_PRESENT] is posted to Supabase as a
 * `phone_activity` event — screen-on alone (tap-to-wake, ambient notification,
 * glancing at the clock at 3am) is not evidence that the user is actively
 * using the phone, and screen-off fires on both intentional locks and passive
 * timeouts. SCREEN_ON / SCREEN_OFF are still received so the in-app
 * [LastEvent] debug UI can show that broadcasts are being observed, but they
 * do not advance "last activity".
 *
 * Those three broadcasts are all "protected" — a manifest-declared receiver
 * never fires for them, so the service exists purely to keep our runtime
 * receiver registered while the phone is idle.
 *
 * When the user has granted `PACKAGE_USAGE_STATS`, we additionally run a
 * [UsageStatsPoller] on the same executor to catch in-app interactions
 * (e.g. scrolling) that never produce a broadcast.
 */
class ScreenStateService : Service() {

    private lateinit var sessionId: String
    private lateinit var poster: SupabasePoster

    // Single-thread scheduler serves both the broadcast receiver's POSTs and
    // the usage-stats poller's periodic ticks; serialization is fine since
    // none of this is latency-critical.
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private var poller: UsageStatsPoller? = null
    private var permissionRetry: ScheduledFuture<*>? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action ?: return
            val ts = Instant.now()
            Log.d(TAG, "received $action at $ts")
            LastEvent.update(action, ts)
            // Only an actual unlock counts as "user is awake and using the
            // phone". Screen on/off can fire from tap-to-wake, notifications
            // lighting the screen, ambient display, or timeouts — none of
            // which imply intent. Real in-app activity while unlocked is
            // captured by UsageStatsPoller.
            if (action == Intent.ACTION_USER_PRESENT) {
                scheduler.execute { poster.post(sessionId, ts) }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        sessionId = UUID.randomUUID().toString()
        poster = SupabasePoster()

        // Android 14+ requires the foregroundServiceType at startForeground
        // time (must match one declared in the manifest).
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            else 0,
        )

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        // Screen state broadcasts are system-only, so no exported flag needed
        // on older APIs. Android 14 requires an explicit flag when registering
        // any receiver from a running app process.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(receiver, filter)
        }

        if (!startPollerIfPermitted()) {
            Log.i(TAG, "usage-stats permission not granted; polling disabled")
            // The user can grant PACKAGE_USAGE_STATS from Settings while the
            // service is already running. Cheap periodic re-check picks it up
            // without requiring a manual Stop / Start.
            permissionRetry = scheduler.scheduleWithFixedDelay(
                {
                    if (startPollerIfPermitted()) {
                        Log.i(TAG, "usage-stats permission granted; poller started")
                        permissionRetry?.cancel(false)
                        permissionRetry = null
                    }
                },
                PERMISSION_RETRY_SECONDS,
                PERMISSION_RETRY_SECONDS,
                TimeUnit.SECONDS,
            )
        }

        Log.i(TAG, "ScreenStateService started, session=$sessionId")
    }

    /**
     * Returns true iff a poller is already running (or was just started).
     * Safe to call repeatedly.
     */
    private fun startPollerIfPermitted(): Boolean {
        if (poller != null) return true
        if (!UsageStatsPoller.hasPermission(this)) return false
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        poller = UsageStatsPoller(usm, poster, sessionId, scheduler).also { it.start() }
        Log.i(TAG, "usage-stats polling enabled")
        return true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // START_STICKY so Android brings the service back if it's killed for
        // memory; the receiver gets re-registered in the fresh onCreate().
        return START_STICKY
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
            // already unregistered
        }
        permissionRetry?.cancel(false)
        permissionRetry = null
        poller?.stop()
        scheduler.shutdown()
        Log.i(TAG, "ScreenStateService stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            nm.getNotificationChannel(CHANNEL_ID) == null
        ) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.notification_channel_desc)
                setShowBadge(false)
            }
            nm.createNotificationChannel(channel)
        }

        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val TAG = "ScreenStateService"
        private const val CHANNEL_ID = "screen_state_tracker"
        private const val NOTIFICATION_ID = 1
        private const val PERMISSION_RETRY_SECONDS = 60L
    }
}
