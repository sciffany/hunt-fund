package com.hunt.sleeptracker

import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Tiny in-memory store shared between [ScreenStateService] and [MainActivity]
 * so the UI can show the most recent broadcast without going back to Supabase.
 * Cleared when the process dies; the durable record is in the DB.
 */
object LastEvent {
    @Volatile
    var action: String? = null
        private set

    @Volatile
    var at: Instant? = null
        private set

    private val listeners = CopyOnWriteArrayList<() -> Unit>()

    fun update(action: String, at: Instant) {
        this.action = action
        this.at = at
        listeners.forEach { runCatching { it() } }
    }

    fun addListener(l: () -> Unit) { listeners.add(l) }
    fun removeListener(l: () -> Unit) { listeners.remove(l) }
}
