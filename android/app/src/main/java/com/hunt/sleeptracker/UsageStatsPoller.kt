package com.hunt.sleeptracker

import android.app.AppOpsManager
import android.app.KeyguardManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.util.Log
import java.time.Instant
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Polls [UsageStatsManager.queryEvents] on a fixed cadence and posts a
 * `phone_activity` row only for interactions that look like real phone use
 * while awake — not overnight system noise.
 *
 * A qualifying event must be [UsageEvents.Event.USER_INTERACTION] from a
 * non-system package, observed while the usage-event stream says the screen
 * is interactive and the keyguard is hidden (unlocked). Ambient wakes,
 * lock-screen noise, notification shade flashes, and face/raise-to-wake
 * unlocks without subsequent app use do not count.
 *
 * Posts are further gated to the local recording window inside
 * [SupabasePoster].
 *
 * Requires the user to grant the `PACKAGE_USAGE_STATS` app-op via
 * Settings → Special app access → Usage access; without it, queryEvents
 * silently returns an empty iterator. Check [hasPermission] before starting.
 */
class UsageStatsPoller(
    private val context: Context,
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

    // Display/lock state reconstructed from the usage-event stream. Defaults
    // assume the phone is asleep/locked so overnight noise cannot count until
    // we observe an unlock + interactive screen.
    @Volatile private var screenInteractive: Boolean = false
    @Volatile private var keyguardHidden: Boolean = false
    @Volatile private var sawDisplayStateEvents: Boolean = false

    fun start() {
        if (task != null) return
        val now = System.currentTimeMillis()
        // Warm up lock/screen state from recent history without posting, so
        // the first tick doesn't assume the wrong baseline.
        hydrateDisplayState(now - STATE_LOOKBACK_MS, now)
        cursorMs = now
        task = scheduler.scheduleWithFixedDelay(
            ::tick,
            intervalMs,
            intervalMs,
            TimeUnit.MILLISECONDS,
        )
        Log.i(
            TAG,
            "started, interval=${intervalMs}ms interactive=$screenInteractive " +
                "unlocked=$keyguardHidden",
        )
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
                applyDisplayState(e.eventType)
                if (
                    e.eventType == UsageEvents.Event.USER_INTERACTION &&
                    e.timeStamp > maxTs &&
                    isRealUserActivity(e.packageName)
                ) {
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

    /**
     * Walk events only to establish screen/keyguard state. Used on startup
     * so we inherit "currently locked" vs "already unlocked" correctly.
     */
    private fun hydrateDisplayState(startMs: Long, endMs: Long) {
        try {
            val events = usm.queryEvents(startMs, endMs)
            val e = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                applyDisplayState(e.eventType)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "hydrateDisplayState failed: ${t.message}")
        }
    }

    private fun applyDisplayState(type: Int) {
        when (type) {
            EVENT_SCREEN_INTERACTIVE -> {
                screenInteractive = true
                sawDisplayStateEvents = true
            }
            EVENT_SCREEN_NON_INTERACTIVE -> {
                screenInteractive = false
                sawDisplayStateEvents = true
            }
            EVENT_KEYGUARD_SHOWN -> {
                keyguardHidden = false
                sawDisplayStateEvents = true
            }
            EVENT_KEYGUARD_HIDDEN -> {
                keyguardHidden = true
                sawDisplayStateEvents = true
            }
        }
    }

    /**
     * True only when the phone looks actively in use by a person: unlocked,
     * screen on for real interaction, and the event is from a normal app
     * (not System UI overnight noise).
     */
    private fun isRealUserActivity(packageName: String?): Boolean {
        if (isSystemNoisePackage(packageName)) return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && sawDisplayStateEvents) {
            screenInteractive && keyguardHidden
        } else {
            // API 26–27 lack keyguard/screen usage events; fall back to live
            // device state at poll time (slightly racy, rarely used).
            val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            km != null && pm != null && !km.isKeyguardLocked && pm.isInteractive
        }
    }

    companion object {
        private const val TAG = "UsageStatsPoller"

        /** Match the desktop tracker's FLUSH_INTERVAL_SECONDS. */
        const val DEFAULT_INTERVAL_MS: Long = 30_000L

        /** How far back to read on start when reconstructing lock/screen state. */
        private const val STATE_LOOKBACK_MS: Long = 10 * 60_000L

        /**
         * Synthetic "action" surfaced to [LastEvent] / the UI so users can
         * see when a poll advanced last-activity.
         */
        const val SYNTHETIC_ACTION = "com.hunt.sleeptracker.USAGE_INTERACTION"

        // UsageEvents.Event constants added in API 28; numeric so we compile
        // against minSdk 26 and simply never observe them on older devices.
        private const val EVENT_SCREEN_INTERACTIVE = 15
        private const val EVENT_SCREEN_NON_INTERACTIVE = 16
        private const val EVENT_KEYGUARD_SHOWN = 17
        private const val EVENT_KEYGUARD_HIDDEN = 18

        private val SYSTEM_NOISE_PACKAGES: Set<String> = setOf(
            "android",
            "com.android.systemui",
            "com.android.systemui.plugin",
            "com.samsung.android.honeyboard", // Samsung keyboard / lock input
            "com.google.android.as", // Android System Intelligence / ambient
        )

        private fun isSystemNoisePackage(packageName: String?): Boolean {
            if (packageName.isNullOrBlank()) return true
            if (packageName in SYSTEM_NOISE_PACKAGES) return true
            // Catch OEM System UI variants (e.g. com.android.systemui.*).
            if (packageName.startsWith("com.android.systemui")) return true
            return false
        }

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
