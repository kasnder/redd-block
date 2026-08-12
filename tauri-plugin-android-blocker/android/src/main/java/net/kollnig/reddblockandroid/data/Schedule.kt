package net.kollnig.reddblockandroid.data

import java.time.DayOfWeek
import java.time.LocalTime

data class Schedule(
    val id: String,
    val name: String,
    val isEnabled: Boolean = true,
    val timing: ScheduleTiming,
    val blockedApps: List<String> = emptyList(),
    val blockedWebsites: List<String> = emptyList(),
    val frictionWordCount: Int = 15,
    /** Literal text the friction gate makes the user type ("custom text" override
     *  difficulty). Null/blank = generate [frictionWordCount] random words. */
    val frictionCustomText: String? = null,
    /** Blocklist emoji/accent colour from the webview, for the native friction gate. */
    val emoji: String? = null,
    val color: String? = null,
    /** Pause expiry (epoch ms) while a JS-initiated pause is in effect. */
    val disabledUntil: Long? = null,
    /** One-shot occurrence window (epoch ms). When [activeUntilMs] is set,
     *  the schedule is active iff now is within [activeFromMs, activeUntilMs)
     *  — time-of-day and days-of-week are ignored. */
    val activeFromMs: Long? = null,
    val activeUntilMs: Long? = null
)

data class ScheduleTiming(
    val type: ScheduleType,
    val timeHour: Int? = null,
    val timeMinute: Int? = null,
    val endTimeHour: Int? = null,
    val endTimeMinute: Int? = null,
    val daysOfWeek: Set<DayOfWeek> = emptySet(),
    val isRecurring: Boolean = true
) {
    enum class ScheduleType {
        DAILY,
        WEEKLY,
        MANUAL
    }

    val time: LocalTime?
        get() = if (timeHour != null && timeMinute != null) {
            LocalTime.of(timeHour, timeMinute)
        } else null

    val endTime: LocalTime?
        get() = if (endTimeHour != null && endTimeMinute != null) {
            LocalTime.of(endTimeHour, endTimeMinute)
        } else null
}
