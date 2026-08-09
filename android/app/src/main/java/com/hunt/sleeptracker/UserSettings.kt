package com.hunt.sleeptracker

import android.content.Context

/**
 * Runtime username stored in SharedPreferences.
 *
 * Defaults to [BuildConfig.USER_NAME] (from `user.name` in local.properties)
 * until the user saves a different value in settings. Changing the name does
 * not migrate historical rows — new posts use the new name only.
 */
object UserSettings {
    private const val PREFS = "user_settings"
    private const val KEY_USER_NAME = "user_name"

    fun getUserName(context: Context): String {
        val stored = context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_USER_NAME, null)
            ?.trim()
        return if (!stored.isNullOrEmpty()) stored else BuildConfig.USER_NAME
    }

    fun setUserName(context: Context, name: String) {
        val trimmed = name.trim()
        require(trimmed.isNotEmpty()) { "username must not be blank" }
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_USER_NAME, trimmed)
            .apply()
    }
}
