package com.hunt.sleeptracker

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.hunt.sleeptracker.databinding.ActivityMainBinding
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val requestNotificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* result ignored — service still runs; only the notification is affected */ }

    private val lastEventListener: () -> Unit = { runOnUiThread { refreshUi() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.startButton.setOnClickListener {
            requestNotificationPermissionIfNeeded()
            startTrackerService(this)
            refreshUi()
        }
        binding.stopButton.setOnClickListener {
            stopService(Intent(this, ScreenStateService::class.java))
            refreshUi()
        }
    }

    override fun onResume() {
        super.onResume()
        LastEvent.addListener(lastEventListener)
        refreshUi()
    }

    override fun onPause() {
        LastEvent.removeListener(lastEventListener)
        super.onPause()
    }

    private fun refreshUi() {
        val running = isServiceRunning()
        binding.statusText.text = if (running) {
            getString(R.string.status_running, BuildConfig.USER_NAME)
        } else {
            getString(R.string.status_stopped)
        }

        val configOk = BuildConfig.SUPABASE_URL.isNotBlank() &&
            BuildConfig.SUPABASE_KEY.isNotBlank()
        binding.configWarning.visibility =
            if (configOk) android.view.View.GONE else android.view.View.VISIBLE

        val action = LastEvent.action
        val at = LastEvent.at
        binding.lastEventText.text = if (action != null && at != null) {
            val local = at.atZone(ZoneId.systemDefault())
            getString(
                R.string.last_event,
                action.substringAfterLast('.'),
                LOCAL_FMT.format(local),
            )
        } else {
            getString(R.string.last_event_none)
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun isServiceRunning(): Boolean {
        @Suppress("DEPRECATION")
        val am = getSystemService(ACTIVITY_SERVICE) as ActivityManager
        // getRunningServices is deprecated for third-party services in general
        // but still returns our own package's services on all supported SDKs.
        return am.getRunningServices(Integer.MAX_VALUE)
            .any { it.service.className == ScreenStateService::class.java.name }
    }

    companion object {
        private val LOCAL_FMT: DateTimeFormatter =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")

        fun startTrackerService(context: Context) {
            val intent = Intent(context, ScreenStateService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }
    }
}
