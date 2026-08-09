package com.hunt.sleeptracker

import android.content.Context
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Durable daily step total backed by SharedPreferences.
 *
 * Primary input is the phone's system [android.hardware.Sensor.TYPE_STEP_COUNTER]
 * cumulative value (kept by the hardware even while our listener is down).
 * Survives process death and reboots: on reboot the raw counter resets to 0,
 * which we detect as a drop and treat subsequent increases as new steps on
 * top of [stepsToday].
 *
 * [onStepDetected] is only for the rare devices that lack a step counter.
 *
 * Day boundaries use the device's local timezone. When the calendar day
 * rolls over, [onDayRollover] is invoked with the completed day's total
 * before the counter resets for the new day.
 */
class DailySteps(
    context: Context,
    private val zone: ZoneId = ZoneId.systemDefault(),
    private val onDayRollover: ((day: LocalDate, steps: Int) -> Unit)? = null,
) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Volatile
    var day: LocalDate = prefs.getString(KEY_DAY, null)?.let(LocalDate::parse) ?: today()
        private set

    @Volatile
    var stepsToday: Int = prefs.getInt(KEY_STEPS, 0)
        private set

    @Volatile
    private var lastRaw: Int = prefs.getInt(KEY_LAST_RAW, -1)

    private val listeners = CopyOnWriteArrayList<() -> Unit>()

    fun addListener(l: () -> Unit) { listeners.add(l) }
    fun removeListener(l: () -> Unit) { listeners.remove(l) }

    /** Apply a new TYPE_STEP_COUNTER reading. Safe to call from any thread. */
    @Synchronized
    fun onRawCounter(raw: Int) {
        rollDayIfNeeded()
        if (lastRaw < 0) {
            // First reading of this install / after prefs clear: establish
            // baseline without inventing steps.
            lastRaw = raw
            persist()
            return
        }
        if (raw < lastRaw) {
            // Counter reset (reboot). Steps already in stepsToday stay;
            // everything from 0..raw is new walking since reboot.
            stepsToday += raw
        } else {
            stepsToday += raw - lastRaw
        }
        lastRaw = raw
        persist()
        notifyListeners()
    }

    /**
     * One hardware-detected step ([android.hardware.Sensor.TYPE_STEP_DETECTOR]).
     * Fallback only when TYPE_STEP_COUNTER is unavailable — these
     * increments are lost for any period the listener was not registered.
     */
    @Synchronized
    fun onStepDetected() {
        rollDayIfNeeded()
        stepsToday += 1
        persist()
        notifyListeners()
    }

    /**
     * Check whether local midnight has passed since the last update.
     * Call periodically from the foreground service so a flush still
     * happens if the sensor is quiet overnight.
     */
    @Synchronized
    fun tick() {
        rollDayIfNeeded()
    }

    @Synchronized
    private fun rollDayIfNeeded() {
        val today = today()
        if (day == today) return
        val completedDay = day
        val completedSteps = stepsToday
        day = today
        stepsToday = 0
        // Keep lastRaw — the next sensor delta belongs to the new day.
        persist()
        notifyListeners()
        if (completedSteps >= 0) {
            onDayRollover?.invoke(completedDay, completedSteps)
        }
    }

    private fun today(): LocalDate = LocalDate.now(zone)

    private fun persist() {
        prefs.edit()
            .putString(KEY_DAY, day.toString())
            .putInt(KEY_STEPS, stepsToday)
            .putInt(KEY_LAST_RAW, lastRaw)
            .apply()
    }

    private fun notifyListeners() {
        listeners.forEach { runCatching { it() } }
    }

    companion object {
        private const val PREFS = "daily_steps"
        private const val KEY_DAY = "day"
        private const val KEY_STEPS = "steps"
        private const val KEY_LAST_RAW = "last_raw"

        /**
         * Read today's count from prefs without mutating state. Returns 0
         * when the stored day is not today (the foreground service owns
         * flushing the completed day on its next [tick]).
         */
        fun peekStepsToday(context: Context, zone: ZoneId = ZoneId.systemDefault()): Int {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val day = prefs.getString(KEY_DAY, null) ?: return 0
            if (day != LocalDate.now(zone).toString()) return 0
            return prefs.getInt(KEY_STEPS, 0)
        }
    }
}
