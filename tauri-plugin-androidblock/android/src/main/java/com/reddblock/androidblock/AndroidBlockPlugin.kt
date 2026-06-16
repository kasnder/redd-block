package com.reddblock.androidblock

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class SaveScheduleArgs {
    lateinit var scheduleJson: String
}

@InvokeArg
class ScheduleIdArgs {
    lateinit var id: String
}

/**
 * Webview-facing command surface. The webview only does CRUD on
 * schedules and opens system settings pages — all enforcement lives in
 * BlockerService / WorkManager and never depends on the webview being
 * alive. Schedules travel as JSON strings in the exact legacy
 * redd-block-android format (see Schedules.parseSchedule).
 */
@TauriPlugin
class AndroidBlockPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: WebView) {
        super.load(webView)
        // Same safety net redd-block-android ran from App.onCreate.
        scheduleWatcher(activity.applicationContext)
    }

    private fun stateResponse(): JSObject {
        val ctx = activity.applicationContext
        Schedules.reEnableExpired(ctx)
        val state = JSONObject().apply {
            put("schedules", Schedules.getAllJson(ctx))
            put("activeScheduleIds", JSONArray(Schedules.getActiveSessions(ctx).map { it.scheduleId }))
            put("permissions", JSONObject().apply {
                put("accessibility", ctx.isAccessibilityServiceEnabled())
                put("notifications", ctx.hasNotificationPermission())
                put("batteryOptimization", ctx.isBatteryOptimizationDisabled())
            })
        }
        return JSObject().apply { put("stateJson", state.toString()) }
    }

    @Command
    fun getState(invoke: Invoke) {
        invoke.resolve(stateResponse())
    }

    @Command
    fun saveSchedule(invoke: Invoke) {
        val args = invoke.parseArgs(SaveScheduleArgs::class.java)
        val ctx = activity.applicationContext
        val schedule = try {
            Schedules.parseSchedule(JSONObject(args.scheduleJson))
        } catch (_: Exception) {
            null
        }
        if (schedule == null) {
            invoke.reject("Invalid schedule JSON")
            return
        }
        ScheduleManager.cancelSchedule(ctx, schedule.id)
        Schedules.stopSession(ctx, schedule.id)
        Schedules.save(schedule, ctx)
        // Same post-save behaviour as redd-block-android's editor screen:
        // (re)register WorkManager triggers for timed schedules.
        if (schedule.timing.type != ScheduleTiming.ScheduleType.MANUAL) {
            ScheduleManager.scheduleTimedSchedule(ctx, schedule)
        }
        invoke.resolve(stateResponse())
    }

    @Command
    fun deleteSchedule(invoke: Invoke) {
        val args = invoke.parseArgs(ScheduleIdArgs::class.java)
        val ctx = activity.applicationContext
        ScheduleManager.cancelSchedule(ctx, args.id)
        Schedules.delete(args.id, ctx)
        invoke.resolve(stateResponse())
    }

    @Command
    fun toggleSchedule(invoke: Invoke) {
        val args = invoke.parseArgs(ScheduleIdArgs::class.java)
        Schedules.toggle(args.id, activity.applicationContext)
        invoke.resolve(stateResponse())
    }

    @Command
    fun getInstalledApps(invoke: Invoke) {
        val ctx = activity.applicationContext
        val pm = ctx.packageManager
        // Same filter as redd-block-android's app picker: user apps plus
        // launchable system apps, excluding ReDD Block itself.
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .filter { info ->
                val isSystem = (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                val hasLauncher = pm.getLaunchIntentForPackage(info.packageName) != null
                (!isSystem || hasLauncher) && info.packageName != ctx.packageName
            }
            .map { it.packageName to pm.getApplicationLabel(it).toString() }
            .sortedBy { it.second.lowercase() }

        val arr = JSONArray()
        apps.forEach { (pkg, label) ->
            arr.put(JSONObject().apply {
                put("packageName", pkg)
                put("label", label)
            })
        }
        invoke.resolve(JSObject().apply { put("appsJson", arr.toString()) })
    }

    private fun openSettings(invoke: Invoke, intent: Intent) {
        try {
            activity.startActivity(intent)
            invoke.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Failed to open settings")
        }
    }

    @Command
    fun openAccessibilitySettings(invoke: Invoke) {
        openSettings(invoke, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    @Command
    fun openNotificationSettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
        }
        openSettings(invoke, intent)
    }

    @SuppressLint("BatteryLife")
    @Command
    fun openBatterySettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${activity.packageName}")
        }
        openSettings(invoke, intent)
    }
}
