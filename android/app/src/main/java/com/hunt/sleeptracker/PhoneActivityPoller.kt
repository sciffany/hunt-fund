package com.hunt.sleeptracker

import android.app.KeyguardManager
import android.content.Context
import android.os.PowerManager
import android.util.Log
import java.time.Instant
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Posts a `PHONE_ACTIVITY` heartbeat every [DEFAULT_INTERVAL_MS] while the
 * phone is unlocked and the screen is on. Ambient / lock-screen wakes do
 * not count (keyguard still showing). [IngestPoster] further skips posts
 * outside the local recording window (default 8pm–6am).
 *
 * Brief unlocks that end before the next tick are ignored — the 2-minute
 * cadence is the noise filter (checking the time, pocket unlocks).
 */
class PhoneActivityPoller(
    private val context: Context,
    private val poster: IngestPoster,
    private val sessionId: String,
    private val scheduler: ScheduledExecutorService,
    private val intervalMs: Long = DEFAULT_INTERVAL_MS,
) {
    @Volatile private var task: ScheduledFuture<*>? = null

    fun start() {
        if (task != null) return
        task = scheduler.scheduleWithFixedDelay(
            ::tick,
            0L,
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
        if (!isUnlockedAndInteractive()) {
            Log.d(TAG, "skip: locked or screen off")
            return
        }
        val ts = Instant.now()
        if (!RecordingWindow.contains(ts)) {
            Log.d(TAG, "skip: outside recording window at $ts")
            return
        }
        poster.post(sessionId, ts)
        LastEvent.update(SYNTHETIC_ACTION, ts)
    }

    private fun isUnlockedAndInteractive(): Boolean {
        val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (km == null || pm == null) return false
        return !km.isKeyguardLocked && pm.isInteractive
    }

    companion object {
        private const val TAG = "PhoneActivityPoller"

        const val DEFAULT_INTERVAL_MS: Long = 2 * 60_000L

        /**
         * Synthetic "action" surfaced to [LastEvent] / the UI so users can
         * see when a poll posted last-activity.
         */
        const val SYNTHETIC_ACTION = "com.hunt.sleeptracker.PHONE_ACTIVITY"
    }
}
