package com.hunt.sleeptracker

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.health.connect.client.PermissionController
import com.hunt.sleeptracker.databinding.ActivityMainBinding
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

    private val requestHealthConnectPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted ->
        if (granted.containsAll(HealthConnectStepsReader.PERMISSIONS)) {
            startTrackerService(this, enableSteps = true)
            if (pendingHcPull) {
                pendingHcPull = false
                pullFromHealthConnect(requestPermissionIfNeeded = false)
            } else {
                Toast.makeText(this, R.string.steps_hc_enabled, Toast.LENGTH_SHORT).show()
                refreshUi()
            }
        } else {
            val wasPull = pendingHcPull
            pendingHcPull = false
            if (wasPull) {
                Toast.makeText(this, R.string.steps_hc_pull_failed, Toast.LENGTH_SHORT).show()
                refreshUi()
            } else {
                Toast.makeText(this, R.string.steps_hc_denied_fallback, Toast.LENGTH_LONG).show()
                enableSensorStepCounting()
            }
        }
    }

    private val lastEventListener: () -> Unit = { runOnUiThread { refreshUi() } }
    private var stepsListener: (() -> Unit)? = null
    private var pendingHcPull = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.usernameInput.setText(UserSettings.getUserName(this))

        binding.startButton.setOnClickListener {
            requestNotificationPermissionIfNeeded()
            requestUsageAccessIfNeeded()
            startTrackerService(this)
            refreshUi()
        }
        binding.sendLastNightButton.setOnClickListener {
            sendLastNight()
        }
        binding.usageAccessText.setOnClickListener {
            requestUsageAccessIfNeeded()
        }
        binding.enableStepsButton.setOnClickListener {
            enableStepCounting()
        }
        binding.pullHealthConnectButton.setOnClickListener {
            pullFromHealthConnect()
        }
        binding.sendStepsButton.setOnClickListener {
            sendCurrentSteps()
        }
        binding.stopButton.setOnClickListener {
            stopService(Intent(this, ScreenStateService::class.java))
            refreshUi()
        }
        binding.saveUsernameButton.setOnClickListener {
            onSaveUsernameClicked()
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
        requestNotificationPermissionIfNeeded()
        when {
            HealthConnectStepsReader.isAvailable(this) -> {
                CoroutineScope(Dispatchers.Main.immediate).launch {
                    val reader = HealthConnectStepsReader(this@MainActivity)
                    val already = withContext(Dispatchers.IO) { reader.hasPermissions() }
                    if (already) {
                        startTrackerService(this@MainActivity, enableSteps = true)
                        refreshUi()
                    } else {
                        requestHealthConnectPermissions.launch(HealthConnectStepsReader.PERMISSIONS)
                    }
                }
            }
            HealthConnectStepsReader.needsInstallOrUpdate(this) -> {
                Toast.makeText(this, R.string.steps_hc_install, Toast.LENGTH_LONG).show()
                HealthConnectStepsReader.openInstallOrUpdate(this)
                // Still allow sensor fallback without waiting on Play Store.
                enableSensorStepCounting()
            }
            else -> {
                Toast.makeText(this, R.string.steps_hc_unavailable, Toast.LENGTH_SHORT).show()
                enableSensorStepCounting()
            }
        }
    }

    private fun enableSensorStepCounting() {
        if (!StepCounterTracker.hasSensor(this)) {
            Toast.makeText(this, R.string.steps_sensor_missing, Toast.LENGTH_LONG).show()
            refreshUi()
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

    private fun pullFromHealthConnect(requestPermissionIfNeeded: Boolean = true) {
        when {
            HealthConnectStepsReader.isAvailable(this) -> {
                CoroutineScope(Dispatchers.Main.immediate).launch {
                    binding.pullHealthConnectButton.isEnabled = false
                    try {
                        val reader = HealthConnectStepsReader(this@MainActivity)
                        val already = withContext(Dispatchers.IO) { reader.hasPermissions() }
                        if (!already) {
                            if (!requestPermissionIfNeeded) {
                                Toast.makeText(
                                    this@MainActivity,
                                    R.string.steps_hc_pull_failed,
                                    Toast.LENGTH_SHORT,
                                ).show()
                                return@launch
                            }
                            pendingHcPull = true
                            requestHealthConnectPermissions.launch(
                                HealthConnectStepsReader.PERMISSIONS,
                            )
                            return@launch
                        }
                        val steps = withContext(Dispatchers.IO) {
                            reader.stepsForDay(LocalDate.now())
                        }
                        applyPulledHealthConnectSteps(steps)
                        Toast.makeText(
                            this@MainActivity,
                            getString(R.string.steps_hc_pulled, steps),
                            Toast.LENGTH_SHORT,
                        ).show()
                    } finally {
                        binding.pullHealthConnectButton.isEnabled = true
                        refreshUi()
                    }
                }
            }
            HealthConnectStepsReader.needsInstallOrUpdate(this) -> {
                Toast.makeText(this, R.string.steps_hc_install_pull, Toast.LENGTH_LONG).show()
                HealthConnectStepsReader.openInstallOrUpdate(this)
            }
            else -> {
                Toast.makeText(this, R.string.steps_hc_unavailable_pull, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun applyPulledHealthConnectSteps(steps: Int) {
        val live = ScreenStateService.sharedDailySteps
        if (live != null) {
            live.setAbsoluteSteps(steps)
            live.source = StepSource.HEALTH_CONNECT
        } else {
            DailySteps(this).apply {
                setAbsoluteSteps(steps)
                source = StepSource.HEALTH_CONNECT
            }
        }
        // Keep background HC polling in sync after a manual pull.
        startTrackerService(this, enableSteps = true)
    }

    private fun sendCurrentSteps() {
        if (!IngestPoster.isConfigured()) {
            Toast.makeText(this, R.string.steps_send_failed, Toast.LENGTH_SHORT).show()
            return
        }
        binding.sendStepsButton.isEnabled = false
        CoroutineScope(Dispatchers.Main.immediate).launch {
            try {
                val days = withContext(Dispatchers.IO) { loadStepsToSend() }
                IngestPoster(this@MainActivity).postDailySteps(
                    days,
                    UUID.randomUUID().toString(),
                )
                Toast.makeText(
                    this@MainActivity,
                    getString(R.string.steps_sent, days.size),
                    Toast.LENGTH_SHORT,
                ).show()
            } finally {
                binding.sendStepsButton.isEnabled = true
            }
        }
    }

    private suspend fun loadStepsToSend(): List<DaySteps> {
        if (HealthConnectStepsReader.isAvailable(this)) {
            val reader = HealthConnectStepsReader(this)
            if (reader.hasPermissions()) {
                return reader.stepsForLastDays(HealthConnectStepsReader.HISTORY_DAYS)
            }
        }
        val live = ScreenStateService.sharedDailySteps
        val day = live?.day ?: LocalDate.now()
        val count = live?.stepsToday ?: DailySteps.peekStepsToday(this)
        return listOf(DaySteps(day, count))
    }

    private fun onSaveUsernameClicked() {
        val next = binding.usernameInput.text?.toString()?.trim().orEmpty()
        if (next.isEmpty()) {
            Toast.makeText(this, R.string.username_blank, Toast.LENGTH_SHORT).show()
            return
        }
        val current = UserSettings.getUserName(this)
        if (next == current) {
            Toast.makeText(this, getString(R.string.username_unchanged, current), Toast.LENGTH_SHORT)
                .show()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.username_change_title)
            .setMessage(getString(R.string.username_change_message, next, current))
            .setNegativeButton(R.string.username_change_cancel, null)
            .setPositiveButton(R.string.username_change_confirm) { _, _ ->
                UserSettings.setUserName(this, next)
                binding.usernameInput.setText(next)
                hideKeyboard()
                Toast.makeText(this, getString(R.string.username_saved, next), Toast.LENGTH_SHORT)
                    .show()
                refreshUi()
            }
            .show()
    }

    private fun hideKeyboard() {
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(binding.usernameInput.windowToken, 0)
        binding.usernameInput.clearFocus()
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
        val userName = UserSettings.getUserName(this)
        binding.statusText.text = if (running) {
            getString(R.string.status_running, userName)
        } else {
            getString(R.string.status_stopped)
        }
        // Keep the field in sync when returning to the screen, but don't
        // stomp mid-edit if the user is typing a new name.
        if (!binding.usernameInput.isFocused) {
            binding.usernameInput.setText(userName)
        }

        val configOk = IngestPoster.isConfigured()
        binding.configWarning.visibility =
            if (configOk) View.GONE else View.VISIBLE

        binding.usageAccessText.text = when {
            !UsageAccess.isSupported() -> getString(R.string.usage_access_unsupported)
            UsageAccess.hasPermission(this) -> getString(R.string.usage_access_granted)
            else -> getString(R.string.usage_access_missing)
        }

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

        val source = ScreenStateService.sharedDailySteps?.source ?: StepSource.NONE
        val stepsOn = running && ScreenStateService.stepsTracking
        binding.enableStepsButton.isEnabled = !stepsOn
        binding.enableStepsButton.text = getString(
            when {
                stepsOn && source == StepSource.HEALTH_CONNECT -> R.string.btn_steps_hc_enabled
                stepsOn -> R.string.btn_steps_enabled
                else -> R.string.btn_enable_steps
            },
        )

        val count = ScreenStateService.sharedDailySteps?.stepsToday
            ?: DailySteps.peekStepsToday(this)
        binding.dailyStepsText.text = when {
            stepsOn && source == StepSource.HEALTH_CONNECT ->
                getString(R.string.daily_steps_hc, count)
            stepsOn && source == StepSource.SENSOR ->
                getString(R.string.daily_steps_sensor, count)
            count > 0 ->
                getString(R.string.daily_steps, count)
            else ->
                getString(R.string.daily_steps_none)
        }

        // Re-bind listener if the service came up after we resumed.
        if (running && stepsListener == null) attachStepsListener()
    }

    private fun sendLastNight() {
        if (!IngestPoster.isConfigured() || !UsageAccess.hasPermission(this)) {
            Toast.makeText(this, R.string.last_night_send_failed, Toast.LENGTH_LONG).show()
            if (!UsageAccess.hasPermission(this)) requestUsageAccessIfNeeded()
            return
        }
        requestNotificationPermissionIfNeeded()
        startTrackerService(this, sendLastNight = true)
        Toast.makeText(this, R.string.last_night_sent, Toast.LENGTH_SHORT).show()
    }

    private fun requestUsageAccessIfNeeded() {
        if (!UsageAccess.isSupported()) return
        if (UsageAccess.hasPermission(this)) return
        AlertDialog.Builder(this)
            .setTitle(R.string.usage_access_title)
            .setMessage(R.string.usage_access_message)
            .setNegativeButton(R.string.usage_access_cancel, null)
            .setPositiveButton(R.string.usage_access_open) { _, _ ->
                UsageAccess.openSettings(this)
            }
            .show()
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

        fun startTrackerService(
            context: Context,
            enableSteps: Boolean = false,
            sendLastNight: Boolean = false,
        ) {
            val intent = Intent(context, ScreenStateService::class.java)
            intent.action = when {
                sendLastNight -> ScreenStateService.ACTION_SEND_LAST_NIGHT
                enableSteps -> ScreenStateService.ACTION_ENABLE_STEPS
                else -> null
            }
            ContextCompat.startForegroundService(context, intent)
        }
    }
}
