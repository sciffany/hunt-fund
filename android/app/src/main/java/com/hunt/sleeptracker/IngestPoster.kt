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

data class DaySteps(val day: LocalDate, val stepCount: Int)

/**
 * POSTs to the hunt-fund Next.js ingest API (Neon via Prisma).
 *
 * Sleep: the daily UsageStats flush posts `PHONE_SESSION_START` /
 * `PHONE_SESSION_END` markers for one local night. Desktop still uses
 * [post] for a single `ACTIVITY` / `APP_CLOSE` row. The legacy
 * `PHONE_ACTIVITY` heartbeat is no longer sent by this app.
 *
 * Steps: a single request posts the last several calendar days into
 * `StepEvent` + `StepNight` (the server keeps the higher daily total).
 * The foreground service posts about every
 * hour (and at local midnight); the activity can also send on demand.
 *
 * [userName] is resolved from [UserSettings] on each post so a settings
 * rename takes effect without restarting the foreground service. It must
 * match the hunt-fund account username.
 */
class IngestPoster(
    context: Context,
    private val url: String = BuildConfig.APP_URL,
    private val token: String = BuildConfig.INGEST_TOKEN,
) {
    private val appContext = context.applicationContext

    private fun userName(): String = UserSettings.getUserName(appContext)
    private val client = OkHttpClient.Builder()
        .callTimeout(15, TimeUnit.SECONDS)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    fun post(sessionId: String, eventTime: Instant) {
        if (!RecordingWindow.contains(eventTime)) {
            Log.d(TAG, "outside recording window; skipping POST at $eventTime")
            return
        }
        if (!configured()) return

        val payload = buildString {
            append('{')
            append("\"username\":").append(jsonString(userName())).append(',')
            append("\"eventType\":\"PHONE_ACTIVITY\",")
            append("\"eventTime\":\"").append(eventTime.toString()).append("\",")
            append("\"sessionId\":\"").append(sessionId).append('"')
            append('}')
        }.toRequestBody(JSON)

        enqueue("$url/api/ingest/sleep", payload)
    }

    /**
     * Replace phone-session markers in [replaceFrom, replaceTo] with [events].
     * Runs synchronously — call from a background thread. Returns whether
     * the server accepted the batch.
     */
    fun postPhoneSessions(
        sessionId: String,
        events: List<PhoneSessionMarker>,
        replaceFrom: Instant,
        replaceTo: Instant,
    ): Boolean {
        if (!configured()) return false

        val toSend = if (events.size > MAX_PHONE_SESSION_EVENTS) {
            Log.w(TAG, "truncating phone-session batch from ${events.size} to $MAX_PHONE_SESSION_EVENTS")
            events.take(MAX_PHONE_SESSION_EVENTS)
        } else {
            events
        }

        val payload = buildString {
            append('{')
            append("\"username\":").append(jsonString(userName())).append(',')
            append("\"sessionId\":\"").append(sessionId).append("\",")
            append("\"replaceFrom\":\"").append(replaceFrom.toString()).append("\",")
            append("\"replaceTo\":\"").append(replaceTo.toString()).append("\",")
            append("\"events\":[")
            toSend.forEachIndexed { index, marker ->
                if (index > 0) append(',')
                append('{')
                append("\"eventType\":\"").append(marker.type.eventType()).append("\",")
                append("\"eventTime\":\"").append(marker.at.toString()).append('"')
                append('}')
            }
            append(']')
            append('}')
        }.toRequestBody(JSON)

        val endpoint = "$url/api/ingest/sleep"
        val req = Request.Builder()
            .url(endpoint)
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .post(payload)
            .build()

        return try {
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(
                        TAG,
                        "POST $endpoint ${response.code}: ${response.body?.string()?.take(200)}",
                    )
                    false
                } else {
                    Log.i(TAG, "posted ${toSend.size} phone-session marker(s)")
                    true
                }
            }
        } catch (e: IOException) {
            Log.w(TAG, "POST $endpoint failed: ${e.message}")
            false
        }
    }

    fun postDailySteps(days: List<DaySteps>, sessionId: String) {
        if (!configured()) return
        val valid = days.filter { it.stepCount >= 0 }
        if (valid.isEmpty()) {
            Log.w(TAG, "refusing empty / negative step payload")
            return
        }

        val payload = buildString {
            append('{')
            append("\"username\":").append(jsonString(userName())).append(',')
            append("\"sessionId\":\"").append(sessionId).append("\",")
            append("\"days\":[")
            valid.forEachIndexed { index, day ->
                if (index > 0) append(',')
                append('{')
                append("\"day\":\"").append(day.day.toString()).append("\",")
                append("\"stepCount\":").append(day.stepCount)
                append('}')
            }
            append(']')
            append('}')
        }.toRequestBody(JSON)

        enqueue("$url/api/ingest/steps", payload)
        Log.i(TAG, "flushing ${valid.size} day(s) of steps")
    }

    private fun configured(): Boolean {
        if (url.isBlank() || token.isBlank()) {
            Log.w(TAG, "APP_URL / INGEST_TOKEN not configured; skipping POST")
            return false
        }
        return true
    }

    private fun enqueue(endpoint: String, body: okhttp3.RequestBody) {
        val req = Request.Builder()
            .url(endpoint)
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
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
        private const val TAG = "IngestPoster"
        private val JSON = "application/json; charset=utf-8".toMediaType()

        fun isConfigured(): Boolean =
            BuildConfig.APP_URL.isNotBlank() && BuildConfig.INGEST_TOKEN.isNotBlank()

        private const val MAX_PHONE_SESSION_EVENTS = 500
    }
}

private fun PhoneSessionType.eventType(): String = when (this) {
    PhoneSessionType.START -> "PHONE_SESSION_START"
    PhoneSessionType.END -> "PHONE_SESSION_END"
}
