package com.hunt.sleeptracker

import java.time.Instant
import java.time.ZoneId

/**
 * Local-time window during which `phone_activity` rows are recorded.
 * Matches the desktop tracker's WINDOW_START_HOUR / WINDOW_END_HOUR
 * (default 20 → 6, i.e. 8pm–6am). When start > end the window wraps
 * midnight.
 */
object RecordingWindow {
    fun contains(eventTime: Instant, zone: ZoneId = ZoneId.systemDefault()): Boolean {
        val hour = eventTime.atZone(zone).hour
        val start = BuildConfig.WINDOW_START_HOUR
        val end = BuildConfig.WINDOW_END_HOUR
        return if (start <= end) {
            hour in start until end
        } else {
            hour >= start || hour < end
        }
    }
}
