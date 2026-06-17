package com.reddblock.androidblock

import android.content.Context
import android.util.Log
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Date
import java.util.concurrent.TimeUnit

/**
 * Manages scheduling of schedules using WorkManager for reliable execution.
 * Ported 1:1 from redd-block-android.
 */
object ScheduleManager {
    private const val TAG = "ScheduleManager"

    fun scheduleAllSchedules(context: Context) {
        val schedules = Schedules.getAll(context).filter { it.isEnabled }
        schedules.forEach { schedule -> scheduleTimedSchedule(context, schedule) }
    }

    fun scheduleTimedSchedule(context: Context, schedule: Schedule) {
        if (!schedule.isEnabled || schedule.timing.type == ScheduleTiming.ScheduleType.MANUAL) {
            return
        }

        if (isScheduleActiveNow(schedule)) {
            Schedules.startSession(context, schedule)
            if (schedule.timing.endTime != null) {
                scheduleDeactivation(context, schedule)
            }
        } else {
            scheduleActivation(context, schedule)
            if (schedule.timing.endTime != null) {
                scheduleDeactivation(context, schedule)
            }
        }
    }

    fun scheduleActivation(context: Context, schedule: Schedule) {
        scheduleWork(context, schedule, isActivation = true)
    }

    fun scheduleDeactivation(context: Context, schedule: Schedule) {
        scheduleWork(context, schedule, isActivation = false)
    }

    fun cancelSchedule(context: Context, scheduleId: String) {
        val workManager = WorkManager.getInstance(context)
        workManager.cancelUniqueWork(ScheduleWorker.getActivationWorkName(scheduleId))
        workManager.cancelUniqueWork(ScheduleWorker.getDeactivationWorkName(scheduleId))
        workManager.cancelUniqueWork(ScheduleWorker.getReEnableWorkName(scheduleId))
        Log.d(TAG, "Cancelled all work for schedule: $scheduleId")
    }

    fun scheduleReEnable(context: Context, scheduleId: String, delayMs: Long) {
        val inputData = Data.Builder()
            .putString(ScheduleWorker.KEY_SCHEDULE_ID, scheduleId)
            .putBoolean(ScheduleWorker.KEY_IS_REENABLE, true)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<ScheduleWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .setInputData(inputData)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            ScheduleWorker.getReEnableWorkName(scheduleId),
            ExistingWorkPolicy.REPLACE,
            workRequest
        )

        Log.d(TAG, "Scheduled re-enable for schedule $scheduleId in ${delayMs / 60000} minutes")
    }

    private fun scheduleWork(context: Context, schedule: Schedule, isActivation: Boolean) {
        val triggerTime = calculateNextTriggerTime(
            schedule.timing, useStartTime = isActivation
        ) ?: return

        val delay = triggerTime - System.currentTimeMillis()
        if (delay <= 0) {
            Log.w(TAG, "Trigger time already passed for ${schedule.name}, skipping")
            return
        }

        val inputData = Data.Builder()
            .putString(ScheduleWorker.KEY_SCHEDULE_ID, schedule.id)
            .putBoolean(ScheduleWorker.KEY_IS_ACTIVATION, isActivation)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<ScheduleWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(inputData)
            .build()

        val workName = if (isActivation) {
            ScheduleWorker.getActivationWorkName(schedule.id)
        } else {
            ScheduleWorker.getDeactivationWorkName(schedule.id)
        }

        WorkManager.getInstance(context).enqueueUniqueWork(
            workName, ExistingWorkPolicy.REPLACE, workRequest
        )

        val action = if (isActivation) "activation" else "deactivation"
        Log.d(TAG, "Scheduled ${schedule.name} $action for ${Date(triggerTime)}")
    }

    fun isScheduleActiveNow(schedule: Schedule): Boolean {
        return getScheduleStartTime(schedule) != null
    }

    fun getScheduleStartTime(schedule: Schedule): Long? {
        return getActiveSegmentWindow(schedule)?.first
    }

    fun getScheduleEndTime(schedule: Schedule): Long? {
        return getActiveSegmentWindow(schedule)?.second
    }

    /** Wall-clock start/end of the schedule segment that is active right now. */
    fun getActiveSegmentWindow(schedule: Schedule): Pair<Long, Long>? {
        val timing = schedule.timing
        val activeFrom = timing.activeFromTimestampMs
        val activeUntil = timing.activeUntilTimestampMs
        if (activeFrom != null && activeUntil != null) {
            val now = System.currentTimeMillis()
            return if (now >= activeFrom && now < activeUntil) {
                activeFrom to activeUntil
            } else {
                null
            }
        }

        val now = LocalDateTime.now()

        if (timing.type == ScheduleTiming.ScheduleType.MANUAL) return null

        val startTime = timing.time ?: return null
        val endTime = timing.endTime ?: return null

        val candidates = listOf(
            now.withHour(startTime.hour).withMinute(startTime.minute).withSecond(0).withNano(0),
            now.minusDays(1).withHour(startTime.hour).withMinute(startTime.minute).withSecond(0).withNano(0)
        )

        for (startCandidate in candidates) {
            val endCandidate = if (endTime.isBefore(startTime)) {
                startCandidate.plusDays(1).withHour(endTime.hour).withMinute(endTime.minute).withSecond(0).withNano(0)
            } else {
                startCandidate.withHour(endTime.hour).withMinute(endTime.minute).withSecond(0).withNano(0)
            }

            if ((now.isEqual(startCandidate) || now.isAfter(startCandidate)) && now.isBefore(endCandidate)) {
                val matchesDay = when (timing.type) {
                    ScheduleTiming.ScheduleType.WEEKLY -> timing.daysOfWeek.contains(startCandidate.dayOfWeek)
                    else -> true
                }
                if (!matchesDay) continue

                val zone = ZoneId.systemDefault()
                val startMs = startCandidate.atZone(zone).toInstant().toEpochMilli()
                val endMs = endCandidate.atZone(zone).toInstant().toEpochMilli()
                return startMs to endMs
            }
        }

        return null
    }

    fun calculateNextTriggerTime(timing: ScheduleTiming, useStartTime: Boolean): Long? {
        if (!timing.isRecurring) {
            val target = if (useStartTime) timing.activeFromTimestampMs else timing.activeUntilTimestampMs
            return target?.takeIf { it > System.currentTimeMillis() }
        }

        val now = LocalDateTime.now()
        val time = if (useStartTime) timing.time else timing.endTime
        if (time == null) return null

        return when (timing.type) {
            ScheduleTiming.ScheduleType.DAILY -> calculateDailyTriggerTime(now, time)
            ScheduleTiming.ScheduleType.WEEKLY -> {
                var targetDays = timing.daysOfWeek
                if (!useStartTime && timing.time != null && timing.endTime != null && timing.endTime!!.isBefore(timing.time!!)) {
                    targetDays = targetDays.map { it.plus(1) }.toSet()
                }
                calculateWeeklyTriggerTime(now, time, targetDays)
            }
            ScheduleTiming.ScheduleType.MANUAL -> null
        }
    }

    fun getMaxScheduleDuration(timing: ScheduleTiming): Long {
        if (!timing.isRecurring) {
            val activeFrom = timing.activeFromTimestampMs
            val activeUntil = timing.activeUntilTimestampMs
            if (activeFrom != null && activeUntil != null && activeUntil > activeFrom) {
                return activeUntil - activeFrom
            }
        }

        val startTime = timing.time
        val endTime = timing.endTime

        if (startTime == null || endTime == null) {
            return 24 * 60 * 60 * 1000L
        }

        val startMinutes = startTime.hour * 60 + startTime.minute
        val endMinutes = endTime.hour * 60 + endTime.minute

        val durationMinutes = if (endMinutes > startMinutes) {
            endMinutes - startMinutes
        } else {
            (24 * 60 - startMinutes) + endMinutes
        }

        return durationMinutes * 60 * 1000L
    }

    private fun calculateDailyTriggerTime(now: LocalDateTime, time: java.time.LocalTime): Long {
        var nextTrigger = now.withHour(time.hour).withMinute(time.minute).withSecond(0)
        if (nextTrigger.isBefore(now) || nextTrigger.isEqual(now)) {
            nextTrigger = nextTrigger.plusDays(1)
        }
        return nextTrigger.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    }

    private fun calculateWeeklyTriggerTime(
        now: LocalDateTime,
        time: java.time.LocalTime,
        targetDays: Set<java.time.DayOfWeek>
    ): Long? {
        if (targetDays.isEmpty()) return null

        var nextTrigger = now.withHour(time.hour).withMinute(time.minute).withSecond(0)
        var daysChecked = 0

        while (daysChecked < 7) {
            if (targetDays.contains(nextTrigger.dayOfWeek) && nextTrigger.isAfter(now)) {
                return nextTrigger.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            }
            nextTrigger = nextTrigger.plusDays(1)
            daysChecked++
        }

        return nextTrigger.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    }
}
