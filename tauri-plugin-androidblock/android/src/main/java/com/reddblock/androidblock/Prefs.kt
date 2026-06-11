package com.reddblock.androidblock

import android.content.Context
import android.content.SharedPreferences

/**
 * Device-protected SharedPreferences shared by the UI plugin, the
 * Accessibility Service, WorkManager workers and the boot receiver.
 * Device-protected storage is readable before the user unlocks the
 * device after a reboot (direct boot), which the directBootAware
 * service and receiver rely on. Same file name ("prefs") and keys as
 * redd-block-android, so the on-device data format is identical.
 *
 * Lazy accessor replaces redd-block-android's lateinit global — every
 * entry point (plugin, service, worker, receiver) can safely call this
 * without an init-order dance.
 */
object Prefs {
    private const val PREFS_NAME = "prefs"

    @Volatile
    private var prefs: SharedPreferences? = null

    fun get(context: Context): SharedPreferences {
        prefs?.let { return it }
        synchronized(this) {
            prefs?.let { return it }
            val deviceContext = context.createDeviceProtectedStorageContext()
            // One-time migration from credential-protected storage (no-op
            // when there is nothing to move) — same as redd-block-android.
            deviceContext.moveSharedPreferencesFrom(context.applicationContext, PREFS_NAME)
            return deviceContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .also { prefs = it }
        }
    }
}
