package net.kollnig.reddblockandroid.schedule

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import net.kollnig.reddblockandroid.util.isPrefsInitialized
import net.kollnig.reddblockandroid.util.prefs

/**
 * Worker that re-enables a schedule when its pause expires. Enqueued by
 * `BlockerPlugin.setSchedules` when JS syncs a paused schedule, so the
 * pause ends on time even if the app process is dead — WorkManager
 * persists the job (including across reboots) without any polling.
 */
class ReEnableWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        if (!isPrefsInitialized) {
            val deviceContext = context.createDeviceProtectedStorageContext()
            prefs = deviceContext.getSharedPreferences("prefs", Context.MODE_PRIVATE)
        }

        val scheduleId = inputData.getString(KEY_SCHEDULE_ID) ?: return Result.failure()
        Schedules.reEnableSchedule(context, scheduleId)
        return Result.success()
    }

    companion object {
        const val KEY_SCHEDULE_ID = "schedule_id"
    }
}
