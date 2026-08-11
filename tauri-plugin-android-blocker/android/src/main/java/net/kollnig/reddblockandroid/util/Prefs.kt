package net.kollnig.reddblockandroid.util

import android.content.SharedPreferences

lateinit var prefs: SharedPreferences

val isPrefsInitialized: Boolean
    get() = ::prefs.isInitialized

/** Pause length prefilled by the native friction gate, in minutes. Written by
 *  `BlockerPlugin.setSchedules` from the webview setting
 *  (`appData.settings.defaultPauseMinutes`), read by `UnlockActivity`. */
const val PREF_DEFAULT_PAUSE_MINUTES = "default_pause_minutes"

/** Fallback when the user has never changed the setting. Mirrors
 *  `FALLBACK_DEFAULT_PAUSE_MINUTES` in src/pause-default.js. */
const val FALLBACK_DEFAULT_PAUSE_MINUTES = 15

/** Same clamp as the webview setting: at least a minute, at most a day. */
fun coerceDefaultPauseMinutes(minutes: Int): Int = minutes.coerceIn(1, 24 * 60)

/** Stored default pause length, clamped, with the 15-minute fallback. */
fun defaultPauseMinutes(): Int {
    if (!isPrefsInitialized) return FALLBACK_DEFAULT_PAUSE_MINUTES
    val stored = prefs.getInt(PREF_DEFAULT_PAUSE_MINUTES, FALLBACK_DEFAULT_PAUSE_MINUTES)
    return coerceDefaultPauseMinutes(stored)
}
