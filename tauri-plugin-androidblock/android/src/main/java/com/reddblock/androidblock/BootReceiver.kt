package com.reddblock.androidblock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val safeContext = context.createDeviceProtectedStorageContext()

        Log.d("BootReceiver", "Action received: ${intent.action}")

        when (intent.action) {
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                // WorkManager may not be available yet during direct boot
                // (LOCKED_BOOT_COMPLETED fires before user unlock); the
                // BOOT_COMPLETED delivery after unlock re-registers, so a
                // failed early attempt is safe to swallow.
                try {
                    ScheduleManager.scheduleAllSchedules(safeContext)
                } catch (e: Exception) {
                    Log.w("BootReceiver", "scheduleAllSchedules failed (direct boot?)", e)
                }
            }
        }
    }
}
