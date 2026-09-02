package com.hunt.sleeptracker

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.util.Log
import java.time.LocalDate

/**
 * Reads [UsageEvents] for one local night window and maps them through
 * [NightUsageSessions]. Requires API 29 (KEYGUARD_HIDDEN / KEYGUARD_SHOWN)
 * and the Usage access grant.
 */
class UsageStatsNightReader(context: Context) {
    private val appContext = context.applicationContext

    fun markersForNight(night: LocalDate): List<PhoneSessionMarker>? {
        if (!UsageAccess.isSupported()) {
            Log.w(TAG, "KEYGUARD usage events need API 29+")
            return null
        }
        if (!UsageAccess.hasPermission(appContext)) {
            Log.w(TAG, "PACKAGE_USAGE_STATS not granted")
            return null
        }

        val usm = appContext.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        if (usm == null) {
            Log.w(TAG, "UsageStatsManager unavailable")
            return null
        }

        val (windowStart, windowEnd) = RecordingWindow.boundsForNight(night)
        val events = usm.queryEvents(windowStart.toEpochMilli(), windowEnd.toEpochMilli())
        val transitions = ArrayList<UsageTransition>()
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val kind = kindOf(event.eventType) ?: continue
            transitions.add(
                UsageTransition(
                    kind,
                    java.time.Instant.ofEpochMilli(event.timeStamp),
                ),
            )
        }
        return NightUsageSessions.markers(transitions, windowStart, windowEnd)
    }

    companion object {
        private const val TAG = "UsageStatsNightReader"

        private fun kindOf(eventType: Int): UsageTransition.Kind? {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
            return when (eventType) {
                UsageEvents.Event.SCREEN_INTERACTIVE -> UsageTransition.Kind.SCREEN_ON
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> UsageTransition.Kind.SCREEN_OFF
                UsageEvents.Event.KEYGUARD_HIDDEN -> UsageTransition.Kind.UNLOCK
                UsageEvents.Event.KEYGUARD_SHOWN -> UsageTransition.Kind.LOCK
                else -> null
            }
        }
    }
}
