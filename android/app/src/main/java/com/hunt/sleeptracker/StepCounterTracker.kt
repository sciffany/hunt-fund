package com.hunt.sleeptracker

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Reads the phone's system pedometer and feeds readings into [DailySteps].
 *
 * Prefers [Sensor.TYPE_STEP_COUNTER]: a cumulative total since reboot that
 * the hardware keeps updating even when this app is not listening, so a
 * later reading catches up on walks during gaps. Falls back to
 * [Sensor.TYPE_STEP_DETECTOR] only when the counter is missing (rare) —
 * detector events are lost while unregistered.
 *
 * Requires [Manifest.permission.ACTIVITY_RECOGNITION] on Android 10+.
 * On Android 14+ the owning foreground service must also declare and start
 * with [android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH].
 *
 * Call [start] / [stop] from the main thread.
 */
class StepCounterTracker(
    private val context: Context,
    private val dailySteps: DailySteps,
) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val counterSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    private val detectorSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)

    @Volatile
    var running: Boolean = false
        private set

    fun start(): Boolean {
        if (running) return true
        if (!hasPermission(context)) {
            Log.i(TAG, "ACTIVITY_RECOGNITION not granted; step counter idle")
            return false
        }
        // Counter first: system cumulative total survives listener gaps.
        val sensor = counterSensor ?: detectorSensor
        if (sensor == null) {
            Log.w(TAG, "no step counter/detector sensor on this device")
            return false
        }
        val ok = sensorManager.registerListener(
            this,
            sensor,
            SensorManager.SENSOR_DELAY_NORMAL,
        )
        running = ok
        if (ok) {
            Log.i(
                TAG,
                "registered ${sensorName(sensor.type)} vendor=${sensor.vendor}",
            )
        } else {
            Log.w(TAG, "failed to register ${sensorName(sensor.type)}")
        }
        return ok
    }

    fun stop() {
        if (!running) return
        sensorManager.unregisterListener(this)
        running = false
        Log.i(TAG, "step sensor unregistered")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        val e = event ?: return
        when (e.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val raw = e.values[0].toInt()
                Log.d(TAG, "step_counter raw=$raw")
                dailySteps.onRawCounter(raw)
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                // Fallback path only (no TYPE_STEP_COUNTER on device).
                Log.d(TAG, "step_detector +1")
                dailySteps.onStepDetected()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    companion object {
        private const val TAG = "StepCounterTracker"

        fun hasPermission(context: Context): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
            return ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACTIVITY_RECOGNITION,
            ) == PackageManager.PERMISSION_GRANTED
        }

        fun hasSensor(context: Context): Boolean {
            val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            return sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null ||
                sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null
        }

        private fun sensorName(type: Int): String = when (type) {
            Sensor.TYPE_STEP_COUNTER -> "TYPE_STEP_COUNTER"
            Sensor.TYPE_STEP_DETECTOR -> "TYPE_STEP_DETECTOR"
            else -> "type=$type"
        }
    }
}
