package com.hunt.sleeptracker

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.hunt.sleeptracker.databinding.ActivityMainBinding
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val requestNotificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* result ignored — service still runs; only the notification is affected */ }

    private val requestActivityRecognition = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            startTrackerService(this, enableSteps = true)
        } else {
            Toast.makeText(this, R.string.steps_permission_denied, Toast.LENGTH_SHORT).show()
        }
        refreshUi()
    }

    private val lastEventListener: () -> Unit = { runOnUiThread { refreshUi() } }
    private var stepsListener: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.startButton.setOnClickListener {
            requestNotificationPermissionIfNeeded()
            startTrackerService(this)
            refreshUi()
        }
        binding.enableStepsButton.setOnClickListener {
            enableStepCounting()
        }
        binding.sendStepsButton.setOnClickListener {
            sendCurrentSteps()
        }
        binding.stopButton.setOnClickListener {
            stopService(Intent(this, ScreenStateService::class.java))
            refreshUi()
        }
        binding.grantUsageAccessButton.setOnClickListener {
            openUsageAccessSettings()
        }
    }

    override fun onResume() {
        super.onResume()
        LastEvent.addListener(lastEventListener)
        attachStepsListener()
        refreshUi()
    }

    override fun onPause() {
        LastEvent.removeListener(lastEventListener)
        detachStepsListener()
        super.onPause()
    }

    private fun enableStepCounting() {
        if (!StepCounterTracker.hasSensor(this)) {
            Toast.makeText(this, R.string.steps_sensor_missing, Toast.LENGTH_LONG).show()
            return
        }
        requestNotificationPermissionIfNeeded()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACTIVITY_RECOGNITION,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                requestActivityRecognition.launch(Manifest.permission.ACTIVITY_RECOGNITION)
                return
            }
        }
        startTrackerService(this, enableSteps = true)
        refreshUi()
    }

    private fun sendCurrentSteps() {
        val configOk = BuildConfig.SUPABASE_URL.isNotBlank() &&
            BuildConfig.SUPABASE_KEY.isNotBlank()
        if (!configOk) {
            Toast.makeText(this, R.string.steps_send_failed, Toast.LENGTH_SHORT).show()
            return
        }
        val live = ScreenStateService.sharedDailySteps
        val day = live?.day ?: LocalDate.now()
        val count = live?.stepsToday ?: DailySteps.peekStepsToday(this)
        SupabasePoster().postDailySteps(day, count, UUID.randomUUID().toString())
        Toast.makeText(this, getString(R.string.steps_sent, count), Toast.LENGTH_SHORT).show()
    }

    private fun attachStepsListener() {
        detachStepsListener()
        val steps = ScreenStateService.sharedDailySteps ?: return
        val listener = { runOnUiThread { refreshUi() } }
        stepsListener = listener
        steps.addListener(listener)
    }

    private fun detachStepsListener() {
        val listener = stepsListener ?: return
        ScreenStateService.sharedDailySteps?.removeListener(listener)
        stepsListener = null
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
            if (configOk) View.GONE else View.VISIBLE

        val usageOk = UsageStatsPoller.hasPermission(this)
        val usageVis = if (usageOk) View.GONE else View.VISIBLE
        binding.usageAccessWarning.visibility = usageVis
        binding.grantUsageAccessButton.visibility = usageVis

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

        val stepsPerm = StepCounterTracker.hasPermission(this)
        val stepsOn = stepsPerm && running &&
            ScreenStateService.sharedDailySteps != null
        binding.enableStepsButton.isEnabled = !stepsOn
        binding.enableStepsButton.text = getString(
            if (stepsOn) R.string.btn_steps_enabled else R.string.btn_enable_steps,
        )

        val count = ScreenStateService.sharedDailySteps?.stepsToday
            ?: DailySteps.peekStepsToday(this)
        binding.dailyStepsText.text = if (stepsPerm || count > 0) {
            getString(R.string.daily_steps, count)
        } else {
            getString(R.string.daily_steps_none)
        }

        // Re-bind listener if the service came up after we resumed.
        if (running && stepsListener == null) attachStepsListener()
    }

    private fun openUsageAccessSettings() {
        // Try the app-specific deep link first (some OEMs honor the package
        // URI, jumping straight to our row); fall back to the generic list.
        val specific = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val generic = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            startActivity(specific)
        } catch (_: Throwable) {
            try {
                startActivity(generic)
            } catch (t: Throwable) {
                Log.w("MainActivity", "no usage-access settings screen: ${t.message}")
            }
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

        fun startTrackerService(context: Context, enableSteps: Boolean = false) {
            val intent = Intent(context, ScreenStateService::class.java)
            if (enableSteps) {
                intent.action = ScreenStateService.ACTION_ENABLE_STEPS
            }
            ContextCompat.startForegroundService(context, intent)
        }
    }
}
