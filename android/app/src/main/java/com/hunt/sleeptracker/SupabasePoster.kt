package com.hunt.sleeptracker

import android.content.Context
import android.util.Log
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/**
 * Fire-and-forget POSTs to Supabase PostgREST.
 *
 * Sleep: qualifying interactions become one `sleep_events` row with
 * `event_type = 'phone_activity'` — a phone-specific value kept distinct
 * from the desktop tracker's `activity` rows. Posts are skipped outside
 * the configured local-time window (same 8pm–6am default as desktop).
 *
 * Steps: at local midnight the service inserts one `step_events` row for
 * the completed calendar day and upserts `step_nights` so per-day totals
 * are queryable without scanning the event stream.
 *
 * [userName] is resolved from [UserSettings] on each post so a settings
 * rename takes effect without restarting the foreground service.
 */
class SupabasePoster(
    context: Context,
    private val url: String = BuildConfig.SUPABASE_URL,
    private val apiKey: String = BuildConfig.SUPABASE_KEY,
) {
    private val appContext = context.applicationContext

    private fun userName(): String = UserSettings.getUserName(appContext)
    private val client = OkHttpClient.Builder()
        .callTimeout(10, TimeUnit.SECONDS)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    fun post(sessionId: String, eventTime: Instant) {
        if (!RecordingWindow.contains(eventTime)) {
            Log.d(TAG, "outside recording window; skipping POST at $eventTime")
            return
        }
        if (!configured()) return

        val payload = buildString {
            append('{')
            append("\"user_name\":").append(jsonString(userName())).append(',')
            append("\"event_type\":\"phone_activity\",")
            append("\"event_time\":\"").append(eventTime.toString()).append("\",")
            append("\"session_id\":\"").append(sessionId).append('"')
            append('}')
        }.toRequestBody(JSON)

        enqueue("$url/rest/v1/sleep_events", payload, prefer = "return=minimal")
    }

    /**
     * Persist a completed calendar day's step total: insert into
     * `step_events` and upsert `step_nights` (PK user_name, night).
     */
    fun postDailySteps(day: LocalDate, stepCount: Int, sessionId: String) {
        if (!configured()) return
        if (stepCount < 0) {
            Log.w(TAG, "refusing negative step_count=$stepCount for $day")
            return
        }
        val eventTime = Instant.now().toString()
        val dayStr = day.toString()

        val name = userName()
        val eventPayload = buildString {
            append('{')
            append("\"user_name\":").append(jsonString(name)).append(',')
            append("\"day\":\"").append(dayStr).append("\",")
            append("\"step_count\":").append(stepCount).append(',')
            append("\"event_time\":\"").append(eventTime).append("\",")
            append("\"session_id\":\"").append(sessionId).append('"')
            append('}')
        }.toRequestBody(JSON)
        enqueue("$url/rest/v1/step_events", eventPayload, prefer = "return=minimal")

        val nightPayload = buildString {
            append('{')
            append("\"user_name\":").append(jsonString(name)).append(',')
            append("\"night\":\"").append(dayStr).append("\",")
            append("\"steps\":").append(stepCount).append(',')
            append("\"updated_at\":\"").append(eventTime).append('"')
            append('}')
        }.toRequestBody(JSON)
        enqueue(
            "$url/rest/v1/step_nights?on_conflict=user_name,night",
            nightPayload,
            prefer = "resolution=merge-duplicates,return=minimal",
        )
        Log.i(TAG, "flushing $stepCount steps for $dayStr")
    }

    private fun configured(): Boolean {
        if (url.isBlank() || apiKey.isBlank()) {
            Log.w(TAG, "Supabase URL/key not configured; skipping POST")
            return false
        }
        return true
    }

    private fun enqueue(endpoint: String, body: okhttp3.RequestBody, prefer: String) {
        val req = Request.Builder()
            .url(endpoint)
            .header("apikey", apiKey)
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .header("Prefer", prefer)
            .post(body)
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "POST $endpoint failed: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        Log.w(TAG, "POST $endpoint ${it.code}: ${it.body?.string()?.take(200)}")
                    } else {
                        Log.d(TAG, "POST $endpoint ${it.code}")
                    }
                }
            }
        })
    }

    private fun jsonString(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (c < ' ') sb.append("\\u%04x".format(c.code)) else sb.append(c)
            }
        }
        sb.append('"')
        return sb.toString()
    }

    companion object {
        private const val TAG = "SupabasePoster"
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
