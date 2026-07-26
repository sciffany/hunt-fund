package com.hunt.sleeptracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restart [ScreenStateService] after reboot or a self-update. We match on
 * BOOT_COMPLETED, LOCKED_BOOT_COMPLETED, and MY_PACKAGE_REPLACED so the
 * tracker survives both a phone restart and an OTA / manual APK reinstall
 * without the user having to open the app.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action !in TRIGGERS) return
        Log.i(TAG, "restarting service after $action")
        MainActivity.startTrackerService(context)
    }

    companion object {
        private const val TAG = "BootReceiver"
        private val TRIGGERS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
        )
    }
}
