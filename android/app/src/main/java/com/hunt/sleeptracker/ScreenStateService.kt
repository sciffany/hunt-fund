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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking

/**
 * Foreground service that owns a runtime-registered [BroadcastReceiver] for
 * SCREEN_ON / SCREEN_OFF / USER_PRESENT.
 *
 * Broadcasts are received only so the in-app [LastEvent] debug UI can show
 * that the service is alive. None of them are posted as `phone_activity`:
 * screen-on/off fire from tap-to-wake, ambient display, and timeouts, and
 * unlock alone is too noisy overnight (face/fingerprint wakes, pocket
 * unlocks, checking the time). Only unlocked, on-screen app interactions
 * counted by [UsageStatsPoller] advance last-activity, and only inside the
 * recording window (default 8pm–6am local).
 *
 * Those three broadcasts are all "protected" — a manifest-declared receiver
 * never fires for them, so the service exists purely to keep our runtime
 * receiver registered while the phone is idle.
 *
 * When the user has granted `PACKAGE_USAGE_STATS`, we additionally run a
 * [UsageStatsPoller] on the same executor to catch in-app interactions
 * (e.g. scrolling) that never produce a broadcast.
 *
 * Steps prefer Google Health Connect ([HealthConnectStepsReader] aggregate of
 * [androidx.health.connect.client.records.StepsRecord]). When HC is
 * unavailable or permission is denied, [StepCounterTracker] reads the phone's
 * system [android.hardware.Sensor.TYPE_STEP_COUNTER]. [DailySteps] flushes
 * the previous calendar day's total to Supabase (`step_events` +
 * `step_nights`) at local midnight.
 */
class ScreenStateService : Service() {

    private lateinit var sessionId: String
    private lateinit var poster: SupabasePoster
    private lateinit var dailySteps: DailySteps
    private lateinit var healthConnect: HealthConnectStepsReader

    // Single-thread scheduler serves both the broadcast receiver's POSTs and
    // the usage-stats poller's periodic ticks; serialization is fine since
    // none of this is latency-critical.
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private var poller: UsageStatsPoller? = null
    private var permissionRetry: ScheduledFuture<*>? = null
    private var midnightTick: ScheduledFuture<*>? = null
    private var stepTracker: StepCounterTracker? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action ?: return
            val ts = Instant.now()
            Log.d(TAG, "received $action at $ts")
            LastEvent.update(action, ts)
            // No POST from broadcasts — unlock-only was a common overnight
            // false positive. UsageStatsPoller owns phone_activity rows.
        }
    }

    override fun onCreate() {
        super.onCreate()
        sessionId = UUID.randomUUID().toString()
        poster = SupabasePoster(this)
        healthConnect = HealthConnectStepsReader(this)
        dailySteps = DailySteps(this) { day, steps ->
            // Callback may arrive on the sensor or scheduler thread.
            poster.postDailySteps(day, steps, sessionId)
        }
        // If the process was dead across midnight, flush the stored day now.
        dailySteps.tick()
        // Expose for the activity's live "today's steps" label.
        sharedDailySteps = dailySteps

        // Android 14+ requires the foregroundServiceType at startForeground
        // time (must match types declared in the manifest). Include "health"
        // only when the pedometer path is active — starting a health FGS
        // without ACTIVITY_RECOGNITION throws SecurityException. HC polling
        // uses dataSync alone.
        promoteForeground(includeHealth = StepCounterTracker.hasPermission(this))

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

        // Prefer HC; fall back to pedometer. Periodic tick refreshes HC
        // aggregates, catches midnight rollover, and retries permission.
        scheduler.execute { syncSteps() }
        midnightTick = scheduler.scheduleWithFixedDelay(
            { syncSteps() },
            STEP_POLL_SECONDS,
            STEP_POLL_SECONDS,
            TimeUnit.SECONDS,
        )

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
        poller = UsageStatsPoller(this, usm, poster, sessionId, scheduler).also { it.start() }
        Log.i(TAG, "usage-stats polling enabled")
        return true
    }

    /**
     * Prefer Health Connect absolute daily totals; otherwise the hardware
     * pedometer. Runs on the scheduler thread (HC uses [runBlocking]).
     */
    private fun syncSteps() {
        val usedHc = runBlocking { tryHealthConnectSync() }
        if (usedHc) {
            mainHandler.post {
                stopSensorTracker()
                // HC reads need only dataSync FGS; drop health type if we
                // had promoted it for a prior sensor session.
                promoteForeground(includeHealth = false)
                dailySteps.source = StepSource.HEALTH_CONNECT
                stepsTracking = true
            }
            return
        }
        // Sensor path: roll day even if the sensor is quiet / not permitted.
        dailySteps.tick()
        // Sensor registration must happen on the main thread.
        mainHandler.post { startStepTrackingIfPermitted() }
    }

    /**
     * @return true when HC is available, permitted, and today's (and any
     * completed day's) totals were applied.
     */
    private suspend fun tryHealthConnectSync(): Boolean {
        if (!HealthConnectStepsReader.isAvailable(this)) return false
        if (!healthConnect.hasPermissions()) return false

        val today = LocalDate.now()
        if (dailySteps.day != today) {
            // Refresh the completed day's absolute total from HC before flush.
            val completed = dailySteps.day
            val finalCount = healthConnect.stepsForDay(completed)
            dailySteps.replaceSteps(finalCount)
            dailySteps.tick()
        }
        val steps = healthConnect.stepsForDay(today)
        dailySteps.setAbsoluteSteps(steps)
        Log.d(TAG, "HC steps for $today = $steps")
        return true
    }

    private fun stopSensorTracker() {
        stepTracker?.stop()
        stepTracker = null
    }

    private fun startStepTrackingIfPermitted() {
        if (stepTracker?.running == true) {
            dailySteps.source = StepSource.SENSOR
            stepsTracking = true
            return
        }
        if (!StepCounterTracker.hasPermission(this)) {
            if (dailySteps.source != StepSource.HEALTH_CONNECT) {
                stepsTracking = false
            }
            return
        }
        // Step sensors require the health FGS type on Android 14+.
        promoteForeground(includeHealth = true)
        if (stepTracker == null) {
            stepTracker = StepCounterTracker(this, dailySteps)
        }
        // Periodic tick retries this if registration failed earlier
        // (permission granted late, or a prior start() returned false).
        stepsTracking = stepTracker?.start() == true
        if (stepsTracking) {
            dailySteps.source = StepSource.SENSOR
        } else {
            Log.w(TAG, "step tracking failed to start despite permission")
        }
    }

    /**
     * (Re)promote this service to the foreground with the right type mask.
     * Safe to call repeatedly — [Service.startForeground] may be invoked
     * again to add types once ACTIVITY_RECOGNITION is granted.
     */
    private fun promoteForeground(includeHealth: Boolean) {
        var types = 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            types = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            if (includeHealth) {
                types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            }
        }
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(),
            types,
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // START_STICKY so Android brings the service back if it's killed for
        // memory; the receiver gets re-registered in the fresh onCreate().
        if (intent?.action == ACTION_ENABLE_STEPS) {
            scheduler.execute { syncSteps() }
        }
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
        midnightTick?.cancel(false)
        midnightTick = null
        poller?.stop()
        stopSensorTracker()
        stepsTracking = false
        if (sharedDailySteps === dailySteps) sharedDailySteps = null
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
        /** HC aggregate refresh + midnight / sensor retry interval. */
        private const val STEP_POLL_SECONDS = 60L
        const val ACTION_ENABLE_STEPS = "com.hunt.sleeptracker.ENABLE_STEPS"

        /** Live counter while the service is up; null when stopped. */
        @Volatile
        var sharedDailySteps: DailySteps? = null
            private set

        /** True while HC polling or the system step-counter listener is active. */
        @Volatile
        var stepsTracking: Boolean = false
            private set
    }
}
