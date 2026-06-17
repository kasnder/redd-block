package com.reddblock.androidblock

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek

/**
 * Single, simple schedule system, ported 1:1 from redd-block-android.
 * Supports MULTIPLE active schedules simultaneously; apps/websites are
 * simply blocked or not. The lateinit-global prefs became Prefs.get()
 * so every entry point passes a Context instead.
 */
object Schedules {
    private const val TAG = "Schedules"
    private const val SCHEDULES_KEY = "routines" // keep legacy key for data compat
    private const val ACTIVE_SESSIONS_KEY = "active_routine_sessions" // keep legacy key

    const val ACTION_CHANGED = "com.reddblock.androidblock.SCHEDULE_CHANGED"
    private const val UI_KIND_ONE_OFF = "one-off-block"

    data class ActiveSession(
        val scheduleId: String,
        val startTime: Long,
        val blockedApps: Set<String>,
        val blockedWebsites: Set<String>
    )

    /** Raw stored JSON — handed to the webview UI unchanged. */
    fun getAllJson(context: Context): JSONArray {
        val json = Prefs.get(context).getString(SCHEDULES_KEY, "[]") ?: "[]"
        return try {
            JSONArray(json)
        } catch (_: Exception) {
            JSONArray()
        }
    }

    fun getAll(context: Context): List<Schedule> {
        return try {
            getAllJson(context).let { arr ->
                (0 until arr.length()).mapNotNull { parseSchedule(arr.getJSONObject(it)) }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun get(context: Context, id: String): Schedule? = getAll(context).find { it.id == id }

    fun save(schedule: Schedule, context: Context) {
        val schedules = getAll(context).toMutableList()
        val index = schedules.indexOfFirst { it.id == schedule.id }

        if (index >= 0) schedules[index] = schedule
        else schedules.add(schedule)

        saveAll(context, schedules)

        // If this schedule has an active session, update its blocked lists
        val sessions = getActiveSessions(context).toMutableList()
        val sessionIndex = sessions.indexOfFirst { it.scheduleId == schedule.id }
        if (sessionIndex >= 0) {
            sessions[sessionIndex] = sessions[sessionIndex].copy(
                blockedApps = schedule.blockedApps.toSet(),
                blockedWebsites = schedule.blockedWebsites.toSet()
            )
            saveActiveSessions(context, sessions)
            broadcast(context)
        }
    }

    fun delete(id: String, context: Context) {
        stopSession(context, id)
        val schedules = getAll(context).filterNot { it.id == id }
        saveAll(context, schedules)
    }

    fun toggle(id: String, context: Context) {
        Log.d(TAG, "Toggle called for schedule ID: $id")

        val schedule = get(context, id) ?: run {
            Log.e(TAG, "Schedule not found: $id")
            return
        }

        val hasActiveSession = getActiveSessions(context).any { it.scheduleId == id }

        if (schedule.isEnabled && hasActiveSession) {
            // Turning OFF
            val updated = if (schedule.autoReenableMinutes > 0) {
                val disabledUntil = System.currentTimeMillis() + schedule.autoReenableMinutes * 60_000L
                schedule.copy(isEnabled = false, disabledUntil = disabledUntil)
            } else {
                schedule.copy(isEnabled = false, disabledUntil = null)
            }

            val schedules = getAll(context).toMutableList()
            val index = schedules.indexOfFirst { it.id == id }
            if (index >= 0) schedules[index] = updated
            saveAll(context, schedules)

            stopSession(context, id)
            if (updated.timing.type != ScheduleTiming.ScheduleType.MANUAL) {
                ScheduleManager.cancelSchedule(context, id)
            }

            // Schedule auto-re-enable if configured
            if (schedule.autoReenableMinutes > 0) {
                ScheduleManager.scheduleReEnable(context, id, schedule.autoReenableMinutes * 60_000L)
            }
        } else if (!schedule.isEnabled) {
            // Turning ON (re-enabling)
            val updated = schedule.copy(isEnabled = true, disabledUntil = null)

            val schedules = getAll(context).toMutableList()
            val index = schedules.indexOfFirst { it.id == id }
            if (index >= 0) schedules[index] = updated
            saveAll(context, schedules)

            startOrScheduleEnabled(context, updated)
        } else {
            // Enabled but no active session — toggle to activate (manual) or just enable scheduling
            val updated = schedule.copy(isEnabled = true)

            val schedules = getAll(context).toMutableList()
            val index = schedules.indexOfFirst { it.id == id }
            if (index >= 0) schedules[index] = updated
            saveAll(context, schedules)

            startOrScheduleEnabled(context, updated)
        }
    }

    private fun startOrScheduleEnabled(context: Context, schedule: Schedule) {
        when (schedule.timing.type) {
            ScheduleTiming.ScheduleType.MANUAL -> {
                startSession(context, schedule)
            }
            ScheduleTiming.ScheduleType.DAILY,
            ScheduleTiming.ScheduleType.WEEKLY -> {
                if (ScheduleManager.isScheduleActiveNow(schedule)) {
                    startSession(context, schedule)
                }
                ScheduleManager.scheduleTimedSchedule(context, schedule)
            }
        }
    }

    fun reEnableSchedule(context: Context, scheduleId: String) {
        Log.d(TAG, "Auto-re-enabling schedule: $scheduleId")
        val schedule = get(context, scheduleId) ?: return
        if (schedule.isEnabled) return // already enabled

        val updated = schedule.copy(isEnabled = true, disabledUntil = null)
        val schedules = getAll(context).toMutableList()
        val index = schedules.indexOfFirst { it.id == scheduleId }
        if (index >= 0) schedules[index] = updated
        saveAll(context, schedules)

        startOrScheduleEnabled(context, updated)
    }

    /**
     * Re-enable any schedules whose disabledUntil has expired — the
     * belt-and-braces pass redd-block-android ran on every screen
     * resume, run here whenever the UI fetches state.
     */
    fun reEnableExpired(context: Context) {
        val now = System.currentTimeMillis()
        for (schedule in getAll(context)) {
            val until = schedule.disabledUntil
            if (!schedule.isEnabled && until != null && until <= now) {
                reEnableSchedule(context, schedule.id)
            }
        }
    }

    private fun saveAll(context: Context, schedules: List<Schedule>) {
        val json = JSONArray().apply {
            schedules.forEach { put(scheduleToJson(it)) }
        }
        Prefs.get(context).edit { putString(SCHEDULES_KEY, json.toString()) }
    }

    fun startSession(context: Context, schedule: Schedule) {
        Log.d(TAG, "Starting session for: ${schedule.name}")

        val sessions = getActiveSessions(context).toMutableList()
        sessions.removeAll { it.scheduleId == schedule.id }

        val newSession = ActiveSession(
            scheduleId = schedule.id,
            startTime = System.currentTimeMillis(),
            blockedApps = schedule.blockedApps.toSet(),
            blockedWebsites = schedule.blockedWebsites.toSet()
        )
        sessions.add(newSession)
        saveActiveSessions(context, sessions)

        Log.d(TAG, "Started session for ${schedule.name} with ${schedule.blockedApps.size} blocked apps and ${schedule.blockedWebsites.size} blocked websites")

        broadcast(context)
    }

    fun stopSession(context: Context, scheduleId: String) {
        Log.d(TAG, "Stopping session for schedule: $scheduleId")

        val sessions = getActiveSessions(context).toMutableList()
        val removed = sessions.removeAll { it.scheduleId == scheduleId }

        if (removed) {
            saveActiveSessions(context, sessions)
            broadcast(context)
        }
    }

    fun getActiveSessions(context: Context): List<ActiveSession> {
        val json = Prefs.get(context).getString(ACTIVE_SESSIONS_KEY, "[]") ?: "[]"
        return try {
            JSONArray(json).let { arr ->
                (0 until arr.length()).mapNotNull {
                    try {
                        val obj = arr.getJSONObject(it)

                        val blockedApps = mutableSetOf<String>()
                        obj.optJSONArray("blockedApps")?.let { appsArr ->
                            for (i in 0 until appsArr.length()) {
                                blockedApps.add(appsArr.getString(i))
                            }
                        }

                        val blockedWebsites = mutableSetOf<String>()
                        obj.optJSONArray("blockedWebsites")?.let { sitesArr ->
                            for (i in 0 until sitesArr.length()) {
                                blockedWebsites.add(sitesArr.getString(i))
                            }
                        }

                        ActiveSession(
                            scheduleId = obj.optString("scheduleId", obj.optString("routineId", "")),
                            startTime = obj.getLong("startTime"),
                            blockedApps = blockedApps,
                            blockedWebsites = blockedWebsites
                        )
                    } catch (_: Exception) {
                        null
                    }
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveActiveSessions(context: Context, sessions: List<ActiveSession>) {
        val json = JSONArray().apply {
            sessions.forEach { session ->
                put(JSONObject().apply {
                    put("scheduleId", session.scheduleId)
                    put("routineId", session.scheduleId) // back-compat
                    put("startTime", session.startTime)
                    put("blockedApps", JSONArray(session.blockedApps.toList()))
                    put("blockedWebsites", JSONArray(session.blockedWebsites.toList()))
                })
            }
        }
        Prefs.get(context).edit { putString(ACTIVE_SESSIONS_KEY, json.toString()) }
    }

    fun isAppBlocked(context: Context, packageName: String): Boolean {
        return findAppBlockMatch(context, packageName) != null
    }

    fun findAppBlockMatch(context: Context, packageName: String): BlockMatch? {
        return pickBlockMatch(collectAppBlockMatches(context, packageName))
    }

    private fun collectAppBlockMatches(context: Context, packageName: String): List<BlockMatch> {
        val sessions = getActiveSessions(context)
        if (sessions.isEmpty()) return emptyList()

        val now = System.currentTimeMillis()
        val pm = context.packageManager
        val matches = mutableListOf<BlockMatch>()

        for (session in sessions) {
            val schedule = get(context, session.scheduleId) ?: continue
            val maxDuration = ScheduleManager.getMaxScheduleDuration(schedule.timing)
            if (now - session.startTime > maxDuration) continue
            if (!session.blockedApps.contains(packageName)) continue

            val appLabel = try {
                pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
            } catch (_: Exception) {
                packageName
            }

            matches.add(
                blockMatchFromSchedule(
                    schedule = schedule,
                    targetLabel = appLabel,
                    blockedPackage = packageName,
                    blockedDomain = null,
                    blockKind = BlockKind.APP
                )
            )
        }
        return matches
    }

    /**
     * Check if a website domain is blocked by ANY active schedule.
     */
    fun isWebsiteBlocked(context: Context, domain: String): Boolean {
        return findWebsiteBlockMatch(context, domain) != null
    }

    fun findWebsiteBlockMatch(
        context: Context,
        domain: String,
        browserPackage: String? = null
    ): BlockMatch? {
        return pickBlockMatch(collectWebsiteBlockMatches(context, domain, browserPackage))
    }

    private fun collectWebsiteBlockMatches(
        context: Context,
        domain: String,
        browserPackage: String?
    ): List<BlockMatch> {
        val sessions = getActiveSessions(context)
        if (sessions.isEmpty()) return emptyList()

        val now = System.currentTimeMillis()
        val matches = mutableListOf<BlockMatch>()

        for (session in sessions) {
            val schedule = get(context, session.scheduleId) ?: continue
            val maxDuration = ScheduleManager.getMaxScheduleDuration(schedule.timing)
            if (now - session.startTime > maxDuration) continue
            val matchesDomain = session.blockedWebsites.any { blockedSite ->
                domain == blockedSite || domain.endsWith(".$blockedSite")
            }
            if (!matchesDomain) continue

            matches.add(
                blockMatchFromSchedule(
                    schedule = schedule,
                    targetLabel = domain,
                    blockedPackage = browserPackage,
                    blockedDomain = domain,
                    blockKind = BlockKind.WEBSITE
                )
            )
        }
        return matches
    }

    private fun pickBlockMatch(matches: List<BlockMatch>): BlockMatch? {
        if (matches.isEmpty()) return null
        return matches.firstOrNull { it.blockSource == BlockSource.ONE_OFF } ?: matches.first()
    }

    private fun blockMatchFromSchedule(
        schedule: Schedule,
        targetLabel: String,
        blockedPackage: String?,
        blockedDomain: String?,
        blockKind: BlockKind
    ): BlockMatch {
        val window = ScheduleManager.getActiveSegmentWindow(schedule)
        return BlockMatch(
            blocklistName = schedule.name,
            blocklistColor = schedule.uiBlocklistColor,
            blocklistEmoji = schedule.uiBlocklistEmoji,
            blockedLabel = targetLabel,
            blockedPackage = blockedPackage,
            blockedDomain = blockedDomain,
            blockKind = blockKind,
            blockSource = blockSourceFrom(schedule),
            segmentStartedAtMs = window?.first,
            segmentEndsAtMs = window?.second
        )
    }

    private fun blockSourceFrom(schedule: Schedule): BlockSource {
        return if (schedule.uiKind == UI_KIND_ONE_OFF) {
            BlockSource.ONE_OFF
        } else {
            BlockSource.SCHEDULE
        }
    }

    private fun broadcast(context: Context) {
        context.sendBroadcast(Intent(ACTION_CHANGED).apply {
            setPackage(context.packageName)
        })
    }

    fun parseSchedule(json: JSONObject): Schedule? = try {
        val timingJson = json.getJSONObject("schedule")
        val timing = ScheduleTiming(
            type = ScheduleTiming.ScheduleType.valueOf(timingJson.getString("type")),
            timeHour = timingJson.optInt("timeHour").takeIf { timingJson.has("timeHour") },
            timeMinute = timingJson.optInt("timeMinute").takeIf { timingJson.has("timeMinute") },
            endTimeHour = timingJson.optInt("endTimeHour").takeIf { timingJson.has("endTimeHour") },
            endTimeMinute = timingJson.optInt("endTimeMinute").takeIf { timingJson.has("endTimeMinute") },
            daysOfWeek = timingJson.optJSONArray("daysOfWeek")?.let { arr ->
                (0 until arr.length()).mapNotNull {
                    try { DayOfWeek.valueOf(arr.getString(it)) } catch (_: Exception) { null }
                }.toSet()
            } ?: emptySet(),
            isRecurring = timingJson.optBoolean("isRecurring", true),
            activeFromTimestampMs = timingJson.optLong("activeFromTimestampMs").takeIf { timingJson.has("activeFromTimestampMs") },
            activeUntilTimestampMs = timingJson.optLong("activeUntilTimestampMs").takeIf { timingJson.has("activeUntilTimestampMs") }
        )

        val blockedApps = json.optJSONArray("blockedApps")?.let { arr ->
            (0 until arr.length()).map { arr.getString(it) }
        } ?: emptyList()

        val blockedWebsites = json.optJSONArray("blockedWebsites")?.let { arr ->
            (0 until arr.length()).map { arr.getString(it) }
        } ?: emptyList()

        Schedule(
            id = json.getString("id"),
            name = json.getString("name"),
            isEnabled = json.getBoolean("isEnabled"),
            timing = timing,
            blockedApps = blockedApps,
            blockedWebsites = blockedWebsites,
            frictionWordCount = json.optInt("frictionWordCount", 15),
            autoReenableMinutes = json.optInt("autoReenableMinutes", 1440),
            disabledUntil = if (json.has("disabledUntil")) json.optLong("disabledUntil") else null,
            uiKind = json.optString("uiKind").takeIf { json.has("uiKind") && it.isNotBlank() },
            uiScheduleId = json.optString("uiScheduleId").takeIf { json.has("uiScheduleId") && it.isNotBlank() },
            uiBlocklistId = json.optString("uiBlocklistId").takeIf { json.has("uiBlocklistId") && it.isNotBlank() },
            uiSegmentIndex = json.optInt("uiSegmentIndex").takeIf { json.has("uiSegmentIndex") },
            uiBlocklistColor = json.optString("uiBlocklistColor").takeIf { json.has("uiBlocklistColor") && it.isNotBlank() },
            uiBlocklistEmoji = json.optString("uiBlocklistEmoji").takeIf { json.has("uiBlocklistEmoji") && it.isNotBlank() }
        )
    } catch (_: Exception) {
        null
    }

    private fun scheduleToJson(schedule: Schedule) = JSONObject().apply {
        put("id", schedule.id)
        put("name", schedule.name)
        put("isEnabled", schedule.isEnabled)

        put("schedule", JSONObject().apply {
            val s = schedule.timing
            put("type", s.type.name)
            s.timeHour?.let { put("timeHour", it) }
            s.timeMinute?.let { put("timeMinute", it) }
            s.endTimeHour?.let { put("endTimeHour", it) }
            s.endTimeMinute?.let { put("endTimeMinute", it) }
            put("daysOfWeek", JSONArray().apply {
                s.daysOfWeek.forEach { put(it.name) }
            })
            put("isRecurring", s.isRecurring)
            s.activeFromTimestampMs?.let { put("activeFromTimestampMs", it) }
            s.activeUntilTimestampMs?.let { put("activeUntilTimestampMs", it) }
        })

        put("blockedApps", JSONArray(schedule.blockedApps))
        put("blockedWebsites", JSONArray(schedule.blockedWebsites))
        put("frictionWordCount", schedule.frictionWordCount)
        put("autoReenableMinutes", schedule.autoReenableMinutes)
        schedule.disabledUntil?.let { put("disabledUntil", it) }
        schedule.uiKind?.let { put("uiKind", it) }
        schedule.uiScheduleId?.let { put("uiScheduleId", it) }
        schedule.uiBlocklistId?.let { put("uiBlocklistId", it) }
        schedule.uiSegmentIndex?.let { put("uiSegmentIndex", it) }
        schedule.uiBlocklistColor?.let { put("uiBlocklistColor", it) }
        schedule.uiBlocklistEmoji?.let { put("uiBlocklistEmoji", it) }
    }
}
