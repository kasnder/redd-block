package com.reddblock.androidblock

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object NotificationHelper {
    const val BLOCKER_CHANNEL_ID = "blocker_channel"
    private const val SCHEDULE_CHANNEL_ID = "routine_channel" // keep legacy ID

    fun Context.createNotificationChannels() {
        val blockerChannel = NotificationChannel(
            BLOCKER_CHANNEL_ID,
            getString(R.string.blocker_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.blocker_channel_desc)
        }

        val scheduleChannel = NotificationChannel(
            SCHEDULE_CHANNEL_ID,
            getString(R.string.schedule_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = getString(R.string.schedule_channel_desc)
        }

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(blockerChannel)
        notificationManager.createNotificationChannel(scheduleChannel)
    }

    @SuppressLint("MissingPermission")
    fun showScheduleActivatedNotification(context: Context, schedule: Schedule) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        // Channel creation is idempotent and cheap; a worker can fire
        // before the Accessibility Service ever connected, so make sure
        // the channel exists before posting.
        context.createNotificationChannels()

        val notification = NotificationCompat.Builder(context, SCHEDULE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_block)
            .setContentTitle(context.getString(R.string.schedule_activated))
            .setContentText(context.getString(R.string.schedule_activated_desc, schedule.name))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context)
            .notify("schedule_${schedule.id}".hashCode(), notification)
    }

    @SuppressLint("MissingPermission")
    fun showScheduleDeactivatedNotification(context: Context, schedule: Schedule) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        context.createNotificationChannels()

        val notification = NotificationCompat.Builder(context, SCHEDULE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_block)
            .setContentTitle(context.getString(R.string.schedule_deactivated))
            .setContentText(context.getString(R.string.schedule_deactivated_desc, schedule.name))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context)
            .notify("schedule_${schedule.id}".hashCode(), notification)
    }
}
