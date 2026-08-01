package com.hunt.sleeptracker

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
import java.util.concurrent.TimeUnit

/**
 * Fire-and-forget POST to the Supabase PostgREST endpoint for
 * `public.sleep_events`. Qualifying interactions become one row with
 * `event_type = 'phone_activity'` — a phone-specific value added to the
 * check constraint in schema.sql, kept distinct from the desktop tracker's
 * 'activity' rows so the two sources can be queried separately.
 *
 * Posts are skipped outside the configured local-time window (same
 * 8pm–6am default as the desktop tracker). We drop on network failure;
 * the next in-window interaction re-establishes "last seen".
 */
class SupabasePoster(
    private val url: String = BuildConfig.SUPABASE_URL,
    private val apiKey: String = BuildConfig.SUPABASE_KEY,
    private val userName: String = BuildConfig.USER_NAME,
) {
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
        if (url.isBlank() || apiKey.isBlank()) {
            Log.w(TAG, "Supabase URL/key not configured; skipping POST")
            return
        }

        val payload = buildString {
            append('{')
            append("\"user_name\":").append(jsonString(userName)).append(',')
            append("\"event_type\":\"phone_activity\",")
            append("\"event_time\":\"").append(eventTime.toString()).append("\",")
            append("\"session_id\":\"").append(sessionId).append('"')
            append('}')
        }.toRequestBody(JSON)

        val req = Request.Builder()
            .url("$url/rest/v1/sleep_events")
            .header("apikey", apiKey)
            .header("Authorization", "Bearer $apiKey")
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .post(payload)
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "POST failed: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        Log.w(TAG, "POST ${it.code}: ${it.body?.string()?.take(200)}")
                    } else {
                        Log.d(TAG, "POST ${it.code}")
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
