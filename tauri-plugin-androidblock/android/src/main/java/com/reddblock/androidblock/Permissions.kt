package com.reddblock.androidblock

import android.content.ComponentName
import android.content.Context
import android.os.PowerManager
import android.provider.Settings

fun Context.isAccessibilityServiceEnabled(): Boolean {
    val component = ComponentName(this, BlockerService::class.java)
    val enabledServices = Settings.Secure.getString(
        contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabledServices.split(':').any {
        ComponentName.unflattenFromString(it) == component
    }
}

fun Context.isBatteryOptimizationDisabled(): Boolean {
    val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
    return powerManager.isIgnoringBatteryOptimizations(packageName)
}
