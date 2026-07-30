package com.hunt.sleeptracker

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.util.Log
import java.time.Instant
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Polls [UsageStatsManager.queryEvents] on a fixed cadence and posts a
 * `phone_activity` row for the newest true user interaction we haven't
 * posted yet — see [ACTIVE_EVENT_TYPES] for the exact set. Activity
 * lifecycle events like MOVE_TO_FOREGROUND are excluded because they fire
 * overnight without any user input (see the note there).
 *
 * This complements [ScreenStateService]'s broadcast receiver: broadcasts
 * catch state transitions instantly but say nothing while the screen stays
 * on, so an hour of scrolling would otherwise leave "last activity" pinned
 * to the initial USER_PRESENT. Usage-stats events keep advancing it.
 *
 * Requires the user to grant the `PACKAGE_USAGE_STATS` app-op via
 * Settings → Special app access → Usage access; without it, queryEvents
 * silently returns an empty iterator. Check [hasPermission] before starting.
 */
class UsageStatsPoller(
    private val usm: UsageStatsManager,
    private val poster: SupabasePoster,
    private val sessionId: String,
    private val scheduler: ScheduledExecutorService,
    private val intervalMs: Long = DEFAULT_INTERVAL_MS,
) {
    @Volatile private var task: ScheduledFuture<*>? = null

    // Left edge of the next queryEvents() window. Advanced to `now` after
    // every tick regardless of success so we don't re-scan the same range
    // on transient failures.
    @Volatile private var cursorMs: Long = 0

    // Dedup guard: only post if the freshest interaction we saw this tick
    // is strictly newer than the one we posted last time.
    @Volatile private var lastPostedMs: Long = 0

    fun start() {
        if (task != null) return
        cursorMs = System.currentTimeMillis() - INITIAL_LOOKBACK_MS
        task = scheduler.scheduleWithFixedDelay(
            ::tick,
            0,
            intervalMs,
            TimeUnit.MILLISECONDS,
        )
        Log.i(TAG, "started, interval=${intervalMs}ms")
    }

    fun stop() {
        task?.cancel(false)
        task = null
        Log.i(TAG, "stopped")
    }

    private fun tick() {
        val now = System.currentTimeMillis()
        var maxTs = 0L
        try {
            val events = usm.queryEvents(cursorMs, now)
            val e = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                if (isUserActivity(e.eventType) && e.timeStamp > maxTs) {
                    maxTs = e.timeStamp
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "queryEvents failed: ${t.message}")
            cursorMs = now
            return
        }
        cursorMs = now

        if (maxTs > lastPostedMs) {
            lastPostedMs = maxTs
            val ts = Instant.ofEpochMilli(maxTs)
            poster.post(sessionId, ts)
            LastEvent.update(SYNTHETIC_ACTION, ts)
        }
    }

    private fun isUserActivity(type: Int): Boolean = type in ACTIVE_EVENT_TYPES

    companion object {
        private const val TAG = "UsageStatsPoller"

        /** Match the desktop tracker's FLUSH_INTERVAL_SECONDS. */
        const val DEFAULT_INTERVAL_MS: Long = 30_000L

        /**
         * Look back this far on the first tick so we don't miss an
         * interaction that happened moments before the service came up.
         */
        private const val INITIAL_LOOKBACK_MS: Long = 60_000L

        /**
         * Synthetic "action" surfaced to [LastEvent] / the UI so users can
         * see when a poll (rather than a broadcast) advanced last-activity.
         */
        const val SYNTHETIC_ACTION = "com.hunt.sleeptracker.USAGE_INTERACTION"

        // Event types we treat as "user is actively using the phone".
        // Values are stable Android constants, referenced numerically for
        // ones added after our minSdk so we don't need SDK guards here.
        //
        // MOVE_TO_FOREGROUND (=1, aka ACTIVITY_RESUMED) is deliberately NOT
        // in this set. It's an activity-lifecycle transition, not a user
        // action: it fires overnight from notifications lighting the lock
        // screen, ambient / always-on-display wakes, OEM-scheduled surfaces
        // (Google feed, Samsung DailyBoard, etc.), fingerprint/face sensor
        // wakes, and background work that briefly surfaces an activity —
        // all of which would otherwise be posted as phone_activity even
        // though the user never touched the phone.
        private val ACTIVE_EVENT_TYPES: Set<Int> = setOf(
            UsageEvents.Event.USER_INTERACTION, // 7 — API 23+, in-app touch/swipe/key
            12, // NOTIFICATION_INTERACTION — API 29+, user tapped a notification
        )

        /**
         * True if the user has granted `PACKAGE_USAGE_STATS` access to us
         * via Settings → Special app access → Usage access.
         */
        fun hasPermission(context: Context): Boolean {
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE)
                as? AppOpsManager ?: return false
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName,
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    context.packageName,
                )
            }
            return mode == AppOpsManager.MODE_ALLOWED
        }
    }
}
