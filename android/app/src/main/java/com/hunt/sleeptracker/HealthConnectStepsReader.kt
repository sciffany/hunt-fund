package com.hunt.sleeptracker

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.LocalDate
import java.time.ZoneId

/**
 * Reads aggregated daily step totals from Google Health Connect.
 *
 * Preferred over the hardware pedometer: watches, Fit, Samsung Health, and
 * on-device steps all feed into the same [StepsRecord.COUNT_TOTAL] aggregate.
 */
class HealthConnectStepsReader(
    private val context: Context,
    private val zone: ZoneId = ZoneId.systemDefault(),
) {
    private val client: HealthConnectClient?
        get() = if (isAvailable(context)) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }

    suspend fun hasPermissions(): Boolean {
        val c = client ?: return false
        return try {
            val granted = c.permissionController.getGrantedPermissions()
            PERMISSIONS.all { it in granted }
        } catch (t: Throwable) {
            Log.w(TAG, "failed to read HC permissions: ${t.message}")
            false
        }
    }

    /**
     * Aggregate step counts for the last [count] local calendar days, oldest first
     * (through today). Days with no Health Connect data are 0.
     */
    suspend fun stepsForLastDays(count: Int = HISTORY_DAYS): List<DaySteps> {
        val today = LocalDate.now(zone)
        val n = count.coerceAtLeast(1)
        return (n - 1 downTo 0).map { offset ->
            val day = today.minusDays(offset.toLong())
            DaySteps(day, stepsForDay(day))
        }
    }

    /**
     * Aggregate step count for the local calendar [day] (midnight → next midnight).
     * Returns 0 when there is no data in range.
     */
    suspend fun stepsForDay(day: LocalDate): Int {
        val c = client ?: return 0
        val start = day.atStartOfDay(zone).toInstant()
        val end = day.plusDays(1).atStartOfDay(zone).toInstant()
        return try {
            val response = c.aggregate(
                AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                ),
            )
            (response[StepsRecord.COUNT_TOTAL] ?: 0L).toInt().coerceAtLeast(0)
        } catch (t: Throwable) {
            Log.w(TAG, "aggregate steps failed for $day: ${t.message}")
            0
        }
    }

    companion object {
        private const val TAG = "HealthConnectSteps"
        private const val HC_PACKAGE = "com.google.android.apps.healthdata"
        const val HISTORY_DAYS = 7

        val PERMISSIONS: Set<String> = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
        )

        fun sdkStatus(context: Context): Int =
            HealthConnectClient.getSdkStatus(context)

        /** True when the Health Connect SDK is present and usable. */
        fun isAvailable(context: Context): Boolean =
            sdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

        /** True when HC needs an update / install before we can use it. */
        fun needsInstallOrUpdate(context: Context): Boolean {
            val status = sdkStatus(context)
            return status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
        }

        fun openInstallOrUpdate(context: Context) {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("market://details?id=$HC_PACKAGE")
                setPackage("com.android.vending")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(intent)
            } catch (_: Throwable) {
                val web = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse(
                        "https://play.google.com/store/apps/details?id=$HC_PACKAGE",
                    )
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                runCatching { context.startActivity(web) }
            }
        }
    }
}
