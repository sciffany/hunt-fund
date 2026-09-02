package com.hunt.sleeptracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
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
 * Foreground service that flushes last night's phone-session markers from
 * UsageStats and syncs daily steps.
 *
 * After the local recording window ends (default 6am), [UsageStatsNightReader]
 * queries unlocked+interactive sessions in [8pm, 6am] and POSTs
 * `PHONE_SESSION_START` / `PHONE_SESSION_END` rows. Brief sessions are
 * stored as-is; the hunt-fund refresh button drops those under 1 minute.
 *
 * Steps prefer Google Health Connect ([HealthConnectStepsReader] aggregate of
 * [androidx.health.connect.client.records.StepsRecord]). When HC is
 * unavailable or permission is denied, [StepCounterTracker] reads the phone's
 * system [android.hardware.Sensor.TYPE_STEP_COUNTER]. [DailySteps] pushes
 * the last 7 Health Connect days (or today's sensor total) to Neon via
 * the hunt-fund ingest API about every hour, and again at local midnight
 * when a completed day rolls over.
 */
class ScreenStateService : Service() {

    private lateinit var sessionId: String
    private lateinit var poster: IngestPoster
    private lateinit var dailySteps: DailySteps
    private lateinit var healthConnect: HealthConnectStepsReader
    private lateinit var usageReader: UsageStatsNightReader

    // Single-thread scheduler serves the phone-session flush and the
    // step-sync ticks; serialization is fine since none of this is
    // latency-critical.
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private var midnightTick: ScheduledFuture<*>? = null
    private var stepTracker: StepCounterTracker? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        sessionId = UUID.randomUUID().toString()
        poster = IngestPoster(this)
        usageReader = UsageStatsNightReader(this)
        healthConnect = HealthConnectStepsReader(this)
        dailySteps = DailySteps(this) { day, steps ->
            // Callback may arrive on the sensor or scheduler thread.
            pushRecentSteps(DaySteps(day, steps))
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

        // Prefer HC; fall back to pedometer. Periodic tick refreshes HC
        // aggregates, catches midnight rollover, retries permission, and
        // uploads to ingest when an hour has passed. Phone-session flush
        // piggybacks on the same tick (cheap until a completed night is pending).
        scheduler.execute { syncAll() }
        midnightTick = scheduler.scheduleWithFixedDelay(
            { syncAll() },
            STEP_POLL_SECONDS,
            STEP_POLL_SECONDS,
            TimeUnit.SECONDS,
        )

        Log.i(TAG, "ScreenStateService started, session=$sessionId")
    }

    private fun syncAll() {
        flushPhoneSessions()
        syncSteps()
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
            maybePushSteps()
            return
        }
        // Sensor path: roll day even if the sensor is quiet / not permitted.
        dailySteps.tick()
        // Sensor registration must happen on the main thread.
        mainHandler.post { startStepTrackingIfPermitted() }
        maybePushSteps()
    }

    /**
     * POST UsageStats sessions for any completed night not yet flushed,
     * oldest first, up to [PHONE_CATCHUP_NIGHTS]. [forceCatchup] re-posts
     * that whole window even if nights were already marked sent.
     */
    private fun flushPhoneSessions(
        forceLastNight: Boolean = false,
        forceCatchup: Boolean = false,
    ) {
        if (!UsageAccess.isSupported()) {
            Log.w(TAG, "phone sessions need API 29+")
            return
        }
        if (!UsageAccess.hasPermission(this)) {
            Log.d(TAG, "skip phone sessions: no usage access")
            return
        }
        if (!IngestPoster.isConfigured()) return

        val lastCompleted = RecordingWindow.lastCompletedNight()
        if (forceLastNight) {
            if (postNight(lastCompleted)) {
                markPhoneNightPosted(lastCompleted)
            }
            return
        }

        val posted = if (forceCatchup) null else lastPostedPhoneNight()
        val oldest = lastCompleted.minusDays(PHONE_CATCHUP_NIGHTS - 1L)
        var night = when {
            posted == null -> oldest
            posted.plusDays(1).isBefore(oldest) -> oldest
            else -> posted.plusDays(1)
        }
        while (!night.isAfter(lastCompleted)) {
            if (!postNight(night)) return
            markPhoneNightPosted(night)
            night = night.plusDays(1)
        }
    }

    private fun postNight(night: LocalDate): Boolean {
        val markers = usageReader.markersForNight(night) ?: return false
        val (start, end) = RecordingWindow.boundsForNight(night)
        val ok = poster.postPhoneSessions(sessionId, markers, start, end)
        if (ok) {
            LastEvent.update(PHONE_SESSIONS_ACTION, Instant.now())
            Log.i(TAG, "flushed ${markers.size} marker(s) for night $night")
        }
        return ok
    }

    private fun lastPostedPhoneNight(): LocalDate? {
        val raw = phonePrefs().getString(KEY_LAST_POSTED_NIGHT, null) ?: return null
        return runCatching { LocalDate.parse(raw) }.getOrNull()
    }

    private fun markPhoneNightPosted(night: LocalDate) {
        val current = lastPostedPhoneNight()
        if (current != null && !night.isAfter(current)) return
        phonePrefs().edit().putString(KEY_LAST_POSTED_NIGHT, night.toString()).apply()
    }

    private fun phonePrefs() = getSharedPreferences(PHONE_PREFS, MODE_PRIVATE)

    /**
     * Upload current totals when [STEP_PUSH_INTERVAL_MS] has elapsed since
     * the last ingest POST (including a midnight rollover flush). Persisted
     * so a service restart does not immediately POST again.
     */
    private fun maybePushSteps() {
        val now = System.currentTimeMillis()
        val last = stepPushPrefs().getLong(KEY_LAST_STEP_PUSH_MS, 0L)
        if (last > 0L && now - last < STEP_PUSH_INTERVAL_MS) return
        pushRecentSteps(DaySteps(dailySteps.day, dailySteps.stepsToday))
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

    /**
     * Prefer the last [HealthConnectStepsReader.HISTORY_DAYS] of Health
     * Connect totals; otherwise post the single [fallback] day we already
     * have (sensor midnight flush).
     */
    private fun pushRecentSteps(fallback: DaySteps) {
        markStepPushNow()
        scheduler.execute {
            val days = runBlocking { loadStepsToPush(fallback) }
            poster.postDailySteps(days, sessionId)
        }
    }

    private fun stepPushPrefs() =
        getSharedPreferences(STEP_PUSH_PREFS, MODE_PRIVATE)

    private fun markStepPushNow() {
        stepPushPrefs().edit()
            .putLong(KEY_LAST_STEP_PUSH_MS, System.currentTimeMillis())
            .apply()
    }

    private suspend fun loadStepsToPush(fallback: DaySteps): List<DaySteps> {
        if (!HealthConnectStepsReader.isAvailable(this)) return listOf(fallback)
        if (!healthConnect.hasPermissions()) return listOf(fallback)
        return healthConnect.stepsForLastDays(HealthConnectStepsReader.HISTORY_DAYS)
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
        // memory; onCreate re-runs the periodic flush.
        when (intent?.action) {
            ACTION_ENABLE_STEPS -> scheduler.execute { syncSteps() }
            ACTION_SEND_LAST_NIGHT -> scheduler.execute { flushPhoneSessions(forceLastNight = true) }
            ACTION_CATCH_UP_NIGHTS -> scheduler.execute { flushPhoneSessions(forceCatchup = true) }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        midnightTick?.cancel(false)
        midnightTick = null
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
        /** HC aggregate refresh + midnight / sensor retry interval. */
        private const val STEP_POLL_SECONDS = 60L
        /** How often in-progress (and recent) day totals are POSTed to ingest. */
        private const val STEP_PUSH_INTERVAL_MS = 60L * 60L * 1000L
        private const val STEP_PUSH_PREFS = "step_ingest"
        private const val KEY_LAST_STEP_PUSH_MS = "last_push_ms"
        private const val PHONE_PREFS = "phone_usage_ingest"
        private const val KEY_LAST_POSTED_NIGHT = "last_posted_night"
        private const val PHONE_CATCHUP_NIGHTS = 7L
        const val ACTION_ENABLE_STEPS = "com.hunt.sleeptracker.ENABLE_STEPS"
        const val ACTION_SEND_LAST_NIGHT = "com.hunt.sleeptracker.SEND_LAST_NIGHT"
        const val ACTION_CATCH_UP_NIGHTS = "com.hunt.sleeptracker.CATCH_UP_NIGHTS"
        const val PHONE_SESSIONS_ACTION = "com.hunt.sleeptracker.PHONE_SESSIONS"

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
