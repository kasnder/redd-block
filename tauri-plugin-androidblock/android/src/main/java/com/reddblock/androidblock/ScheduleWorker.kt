package com.reddblock.androidblock

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class ScheduleWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val scheduleId = inputData.getString(KEY_SCHEDULE_ID) ?: return Result.failure()
        val isReEnable = inputData.getBoolean(KEY_IS_REENABLE, false)

        if (isReEnable) {
            Schedules.reEnableSchedule(context, scheduleId)
            return Result.success()
        }

        val isActivation = inputData.getBoolean(KEY_IS_ACTIVATION, true)

        val schedule = Schedules.get(context, scheduleId)
        if (schedule == null || !schedule.isEnabled) {
            Log.w(TAG, "Schedule $scheduleId not found or disabled")
            return Result.success()
        }

        if (isActivation) {
            Schedules.startSession(context, schedule)
            if (schedule.timing.isRecurring) {
                ScheduleManager.scheduleActivation(context, schedule)
            }
        } else {
            Schedules.stopSession(context, scheduleId)
            if (schedule.timing.isRecurring) {
                ScheduleManager.scheduleTimedSchedule(context, schedule)
            }
        }

        return Result.success()
    }

    companion object {
        private const val TAG = "ScheduleWorker"
        const val KEY_SCHEDULE_ID = "schedule_id"
        const val KEY_IS_ACTIVATION = "is_activation"
        const val KEY_IS_REENABLE = "is_reenable"

        fun getActivationWorkName(scheduleId: String) = "schedule_activation_$scheduleId"
        fun getDeactivationWorkName(scheduleId: String) = "schedule_deactivation_$scheduleId"
        fun getReEnableWorkName(scheduleId: String) = "schedule_reenable_$scheduleId"
    }
}
