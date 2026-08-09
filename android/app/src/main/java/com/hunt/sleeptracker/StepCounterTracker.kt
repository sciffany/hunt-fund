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
 * Listens to the hardware step counter (accelerometer-backed) and feeds
 * readings into [DailySteps]. Requires [Manifest.permission.ACTIVITY_RECOGNITION]
 * on Android 10+.
 */
class StepCounterTracker(
    private val context: Context,
    private val dailySteps: DailySteps,
) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    @Volatile
    var running: Boolean = false
        private set

    fun start(): Boolean {
        if (running) return true
        if (!hasPermission(context)) {
            Log.i(TAG, "ACTIVITY_RECOGNITION not granted; step counter idle")
            return false
        }
        val s = sensor
        if (s == null) {
            Log.w(TAG, "TYPE_STEP_COUNTER not available on this device")
            return false
        }
        val ok = sensorManager.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL)
        running = ok
        if (ok) Log.i(TAG, "step counter registered")
        else Log.w(TAG, "failed to register step counter")
        return ok
    }

    fun stop() {
        if (!running) return
        sensorManager.unregisterListener(this)
        running = false
        Log.i(TAG, "step counter unregistered")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_STEP_COUNTER) return
        dailySteps.onRawCounter(event.values[0].toInt())
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
            return sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
        }
    }
}
