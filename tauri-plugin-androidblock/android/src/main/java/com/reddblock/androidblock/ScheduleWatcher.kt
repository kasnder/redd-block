package com.reddblock.androidblock

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Periodic safety net (every 15 min) that re-registers schedule alarms,
 * ported from redd-block-android's App.kt. There the Application class
 * enqueued it on every process start; here the plugin (on webview load),
 * the Accessibility Service (on connect) and the boot receiver call it.
 */
fun scheduleWatcher(context: Context) {
    val workRequest = PeriodicWorkRequestBuilder<ScheduleWatcherWorker>(
        15, TimeUnit.MINUTES,
        5, TimeUnit.MINUTES
    ).setConstraints(Constraints.NONE).build()

    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        "ReDDBlockSafetyNet",
        ExistingPeriodicWorkPolicy.KEEP,
        workRequest
    )
}

class ScheduleWatcherWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {
    override suspend fun doWork(): Result {
        ScheduleManager.scheduleAllSchedules(applicationContext)
        return Result.success()
    }
}
