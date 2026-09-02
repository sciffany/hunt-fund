package com.hunt.sleeptracker

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Local-time window during which phone-session markers are recorded.
 * Matches the desktop tracker's WINDOW_START_HOUR / WINDOW_END_HOUR
 * (default 20 → 6, i.e. 8pm–6am). When start > end the window wraps
 * midnight.
 */
object RecordingWindow {
    fun startHour(): Int = BuildConfig.WINDOW_START_HOUR

    fun endHour(): Int = BuildConfig.WINDOW_END_HOUR

    fun contains(eventTime: Instant, zone: ZoneId = ZoneId.systemDefault()): Boolean {
        val hour = eventTime.atZone(zone).hour
        val start = startHour()
        val end = endHour()
        return if (start <= end) {
            hour in start until end
        } else {
            hour >= start || hour < end
        }
    }

    /**
     * Night-anchor date that [instant] falls in. For a wrapping 8pm–6am
     * window, 2am on Sep 2 belongs to the night of Sep 1.
     */
    fun nightAnchor(
        instant: Instant,
        zone: ZoneId = ZoneId.systemDefault(),
    ): LocalDate {
        val zoned = instant.atZone(zone)
        val date = zoned.toLocalDate()
        val start = startHour()
        val end = endHour()
        if (start <= end) return date
        return if (zoned.hour < end) date.minusDays(1) else date
    }

    /** Inclusive local start and exclusive local end of [night]'s window. */
    fun boundsForNight(
        night: LocalDate,
        zone: ZoneId = ZoneId.systemDefault(),
    ): Pair<Instant, Instant> {
        val start = night.atTime(LocalTime.of(startHour(), 0)).atZone(zone).toInstant()
        val endDate = if (startHour() <= endHour()) night else night.plusDays(1)
        val end = endDate.atTime(LocalTime.of(endHour(), 0)).atZone(zone).toInstant()
        return start to end
    }

    /**
     * Most recently finished night-anchor date. While the current window
     * is still open, returns the previous night.
     */
    fun lastCompletedNight(
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): LocalDate {
        val current = nightAnchor(now, zone)
        val (_, end) = boundsForNight(current, zone)
        return if (now < end) current.minusDays(1) else current
    }
}
