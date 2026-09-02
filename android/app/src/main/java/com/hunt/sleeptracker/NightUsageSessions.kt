package com.hunt.sleeptracker

import java.time.Instant

enum class PhoneSessionType {
    START,
    END,
}

data class PhoneSessionMarker(
    val type: PhoneSessionType,
    val at: Instant,
)

data class UsageTransition(
    val kind: Kind,
    val at: Instant,
) {
    enum class Kind {
        SCREEN_ON,
        SCREEN_OFF,
        UNLOCK,
        LOCK,
    }
}

/**
 * Rebuild unlocked-and-interactive sessions from UsageStats transitions
 * inside [windowStart, windowEnd).
 *
 * The first [PhoneSessionType.START] is the first time both flags become
 * true at or after [windowStart] — no lookback, no synthetic start at
 * 8pm if the phone was already in use. An unmatched lock/screen-off is
 * ignored. A session still open at [windowEnd] is closed there (6am).
 */
object NightUsageSessions {
    fun markers(
        transitions: List<UsageTransition>,
        windowStart: Instant,
        windowEnd: Instant,
    ): List<PhoneSessionMarker> {
        if (!windowStart.isBefore(windowEnd)) return emptyList()

        var interactive = false
        var unlocked = false
        var sessionStart: Instant? = null
        val intervals = ArrayList<Pair<Instant, Instant>>()

        fun active() = interactive && unlocked

        for (transition in transitions.sortedBy { it.at }) {
            if (transition.at < windowStart) continue
            if (!transition.at.isBefore(windowEnd)) break

            val wasActive = active()
            when (transition.kind) {
                UsageTransition.Kind.SCREEN_ON -> interactive = true
                UsageTransition.Kind.SCREEN_OFF -> interactive = false
                UsageTransition.Kind.UNLOCK -> unlocked = true
                UsageTransition.Kind.LOCK -> unlocked = false
            }
            val nowActive = active()
            if (nowActive && !wasActive) {
                if (sessionStart == null) sessionStart = transition.at
            } else if (!nowActive && wasActive) {
                val start = sessionStart
                if (start != null) {
                    intervals.add(start to transition.at)
                    sessionStart = null
                }
            }
        }

        val openStart = sessionStart
        if (openStart != null) {
            intervals.add(openStart to windowEnd)
        }

        return intervals.flatMap { (start, end) ->
            listOf(
                PhoneSessionMarker(PhoneSessionType.START, start),
                PhoneSessionMarker(PhoneSessionType.END, end),
            )
        }
    }
}
