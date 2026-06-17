package com.reddblock.androidblock

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import androidx.core.content.ContextCompat

/**
 * The blocking engine, ported 1:1 from redd-block-android. Watches
 * foreground window changes: blocked apps and websites show a branded
 * fullscreen overlay with blocklist context. Runs entirely independently
 * of the Tauri webview, so blocking keeps working when the app is closed.
 */
@SuppressLint("AccessibilityPolicy")
class BlockerService : AccessibilityService() {

    private val scheduleChangeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Schedules.ACTION_CHANGED) {
                Log.d(TAG, "Schedule state changed, re-checking foreground browser")
                lastCheckedUrl = null
                checkCurrentBrowserUrl(allowFocusedUrlBar = true)
            }
        }
    }

    private var lastCheckedUrl: String? = null
    private var lastUrlCheckTime: Long = 0
    private var lastBlockTime: Long = 0
    private val URL_CHECK_THROTTLE_MS = 500L
    private val BLOCK_THROTTLE_MS = 2000L

    private lateinit var blockOverlay: BlockOverlayController

    override fun onServiceConnected() {
        super.onServiceConnected()
        blockOverlay = BlockOverlayController(this) {
            performGlobalAction(GLOBAL_ACTION_HOME)
        }

        val filter = IntentFilter(Schedules.ACTION_CHANGED)
        ContextCompat.registerReceiver(
            this, scheduleChangeReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED
        )

        scheduleWatcher(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        val keyguardManager = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (keyguardManager.isKeyguardLocked) return

        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                if (event.contentChangeTypes == AccessibilityEvent.CONTENT_CHANGE_TYPE_CONTENT_DESCRIPTION) {
                    return
                }
                if (isSupportedBrowser(pkg)) {
                    maybeBlockBrowserWebsite(pkg) { extractUrlFromEvent(event) }
                    return
                }
            }
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (isSupportedBrowser(pkg)) {
                    maybeBlockBrowserWebsite(pkg) { extractUrlFromRoot(pkg, allowFocusedUrlBar = false) }
                    return
                }
            }
            else -> return
        }

        if (shouldSkipPackage(pkg)) return

        val match = Schedules.findAppBlockMatch(this, pkg) ?: return
        showBlockOverlay(match)
    }

    private fun maybeBlockBrowserWebsite(
        browserPackage: String,
        force: Boolean = false,
        extractUrl: () -> String?
    ) {
        val currentTime = System.currentTimeMillis()
        if (!force && currentTime - lastUrlCheckTime < URL_CHECK_THROTTLE_MS) return
        lastUrlCheckTime = currentTime

        val url = extractUrl() ?: return
        lastCheckedUrl = url

        val domain = extractDomain(url) ?: return
        val match = Schedules.findWebsiteBlockMatch(this, domain, browserPackage) ?: return
        showBlockOverlay(match)
    }

    private fun showBlockOverlay(match: BlockMatch) {
        val currentTime = System.currentTimeMillis()
        val targetKey = when (match.blockKind) {
            BlockKind.APP -> "app:${match.blockedPackage}"
            BlockKind.WEBSITE -> "site:${match.blockedDomain}"
        }
        if (blockOverlay.isShowingFor(targetKey)) {
            blockOverlay.show(match)
            return
        }
        if (currentTime - lastBlockTime < BLOCK_THROTTLE_MS) return

        Log.d(
            TAG,
            "Blocking ${match.blockKind.name.lowercase()} ${match.blockedLabel} for blocklist ${match.blocklistName}"
        )
        lastBlockTime = currentTime
        blockOverlay.show(match)
    }

    private fun checkCurrentBrowserUrl(allowFocusedUrlBar: Boolean) {
        val root = rootInActiveWindow ?: return
        try {
            val pkg = root.packageName?.toString() ?: return
            if (!isSupportedBrowser(pkg)) return
            maybeBlockBrowserWebsite(pkg, force = true) {
                extractUrlFromRoot(pkg, allowFocusedUrlBar)
            }
        } finally {
            root.recycle()
        }
    }

    private fun shouldSkipPackage(packageName: String): Boolean {
        return try {
            val info = this.packageManager.getApplicationInfo(packageName, 0)
            val isSystem = (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            if (isSystem) {
                this.packageManager.getLaunchIntentForPackage(packageName) == null
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    /** Maps browser package names to their URL bar view IDs */
    private val browserUrlViewIds = mapOf(
        // Firefox variants
        "org.mozilla.firefox" to listOf("mozac_browser_toolbar_url_view", "url_bar_title"),
        "org.mozilla.firefox_beta" to listOf("mozac_browser_toolbar_url_view", "url_bar_title"),
        "org.mozilla.fenix" to listOf("mozac_browser_toolbar_url_view", "url_bar_title"),
        "org.mozilla.fenix.nightly" to listOf("mozac_browser_toolbar_url_view", "url_bar_title"),
        "org.mozilla.focus" to listOf("mozac_browser_toolbar_url_view", "url_bar_title"),
        // Chrome / Chromium
        "com.android.chrome" to listOf("url_bar", "origin"),
        "com.chrome.beta" to listOf("url_bar"),
        "org.chromium.chrome" to listOf("url_bar"),
        // Brave
        "com.brave.browser" to listOf("url_bar"),
        "com.brave.browser_beta" to listOf("url_bar"),
        "com.brave.browser_nightly" to listOf("url_bar"),
        // Samsung Internet
        "com.sec.android.app.sbrowser" to listOf("location_bar_edit_text"),
        // Microsoft Edge
        "com.microsoft.emmx" to listOf("url_bar"),
        // Opera variants
        "com.opera.browser" to listOf("url_field"),
        "com.opera.browser.beta" to listOf("url_field"),
        "com.opera.mini.native" to listOf("url_field"),
        "com.opera.mini.native.beta" to listOf("url_field"),
        "com.opera.touch" to listOf("addressbarEdit"),
        // Vivaldi
        "com.vivaldi.browser" to listOf("url_bar"),
        // Kiwi Browser
        "com.kiwibrowser.browser" to listOf("url_bar"),
        // DuckDuckGo
        "com.duckduckgo.mobile.android" to listOf("omnibarTextInput"),
        // Ecosia
        "com.ecosia.android" to listOf("url_bar"),
        // Huawei Browser
        "com.huawei.browser" to listOf("url_bar"),
        // Android system browser (AOSP)
        "com.android.browser" to listOf("url"),
        // Google Search app (in-app browser)
        "com.google.android.googlequicksearchbox" to listOf("googleapp_srp_search_box_text"),
    )

    private fun isSupportedBrowser(packageName: String): Boolean {
        return packageName in browserUrlViewIds
    }

    private fun extractUrlFromEvent(event: AccessibilityEvent): String? {
        val pkg = event.packageName?.toString() ?: return null
        val root = rootInActiveWindow ?: return null
        try {
            return extractUrlFromRoot(pkg, allowFocusedUrlBar = false, root = root)
        } finally {
            root.recycle()
        }
    }

    private fun extractUrlFromRoot(
        pkg: String,
        allowFocusedUrlBar: Boolean,
        root: android.view.accessibility.AccessibilityNodeInfo? = null
    ): String? {
        val windowRoot = root ?: rootInActiveWindow ?: return null
        val shouldRecycleRoot = root == null
        try {
            val viewIds = browserUrlViewIds[pkg] ?: return null
            val knownUrlViewIds = viewIds.map { "$pkg:id/$it" }

            for (viewId in knownUrlViewIds) {
                val nodes = windowRoot.findAccessibilityNodeInfosByViewId(viewId)
                if (nodes.isNullOrEmpty()) continue
                for (node in nodes) {
                    try {
                        // Skip focused URL bar while typing so autocomplete
                        // suggestions are not treated as navigation.
                        if (!allowFocusedUrlBar && node.isFocused) continue
                        val text = node.text?.toString()
                        if (text != null && isValidUrlFormat(text)) {
                            return text
                        }
                    } finally {
                        node.recycle()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting URL", e)
        } finally {
            if (shouldRecycleRoot) {
                windowRoot.recycle()
            }
        }
        return null
    }

    private fun isValidUrlFormat(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true
        if (trimmed.contains(" ") || trimmed.length < 4) return false
        val domainPattern = Regex("^[a-zA-Z0-9][a-zA-Z0-9.-]*\\.[a-zA-Z]{2,}(/.*)?$")
        return domainPattern.matches(trimmed)
    }

    private fun extractDomain(url: String): String? {
        return try {
            var normalizedUrl = url.trim()
            if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
                normalizedUrl = "https://$normalizedUrl"
            }
            val uri = java.net.URI(normalizedUrl)
            uri.host?.lowercase()?.removePrefix("www.")
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting domain from URL: $url", e)
            null
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        if (::blockOverlay.isInitialized) {
            blockOverlay.dismiss(sendHome = false)
        }
        super.onDestroy()
        try {
            unregisterReceiver(scheduleChangeReceiver)
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering receiver", e)
        }
    }

    companion object {
        private const val TAG = "BlockerService"
    }
}
