package com.reddblock.androidblock

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.content.ContextCompat

/**
 * Watches foreground apps and browser URLs. Blocked apps get a fullscreen
 * native overlay; blocked websites are redirected to a local block page
 * inside the browser tab so the URL bar stays usable.
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
    private val lastBlockTimeByTarget = mutableMapOf<String, Long>()
    private val lastWebsiteNavAt = mutableMapOf<String, Long>()
    private val lastWebsiteNavUrl = mutableMapOf<String, String>()
    private val URL_CHECK_THROTTLE_MS = 500L
    private val BLOCK_THROTTLE_SAME_TARGET_MS = 400L
    private val WEBSITE_NAV_COOLDOWN_MS = 2000L

    private lateinit var blockOverlay: BlockOverlayController
    private lateinit var blockPageServer: LocalBlockPageServer

    override fun onServiceConnected() {
        super.onServiceConnected()
        blockOverlay = BlockOverlayController(this) {
            performGlobalAction(GLOBAL_ACTION_HOME)
        }
        blockOverlay.prepare()

        blockPageServer = LocalBlockPageServer(this)
        blockPageServer.start()

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
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (BrowserUrlAccess.isSupportedBrowser(pkg)) {
                    maybeBlockBrowserWebsite(pkg) {
                        readBrowserUrl(pkg, allowFocusedUrlBar = false)
                    }
                } else {
                    maybeBlockApp(pkg)
                }
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                if (event.contentChangeTypes == AccessibilityEvent.CONTENT_CHANGE_TYPE_CONTENT_DESCRIPTION) {
                    return
                }
                if (BrowserUrlAccess.isSupportedBrowser(pkg)) {
                    maybeBlockBrowserWebsite(pkg) {
                        readBrowserUrl(pkg, allowFocusedUrlBar = false)
                    }
                } else {
                    maybeBlockApp(pkg)
                }
            }
            else -> return
        }
    }

    private fun maybeBlockApp(packageName: String) {
        if (shouldSkipPackage(packageName)) return
        val match = Schedules.findAppBlockMatch(this, packageName) ?: return
        showAppBlockOverlay(match)
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

        if (blockPageServer.isBlockPageUrl(url)) {
            maybeRefreshBlockPage(browserPackage, url)
            return
        }

        val domain = extractDomain(url) ?: return
        val match = Schedules.findWebsiteBlockMatch(this, domain, browserPackage)
        if (match == null) return
        navigateBrowserToBlockPage(browserPackage, match, url)
    }

    private fun maybeRefreshBlockPage(browserPackage: String, blockPageUrl: String) {
        val normalized = if (blockPageUrl.startsWith("http")) blockPageUrl else "http://$blockPageUrl"
        val uri = android.net.Uri.parse(normalized)
        val domain = uri.getQueryParameter("domain")?.trim().orEmpty().ifEmpty { return }
        val originalUrl = uri.getQueryParameter("u")?.trim().orEmpty().ifEmpty { return }
        val match = Schedules.findWebsiteBlockMatch(this, domain, browserPackage) ?: return
        val updatedUrl = blockPageServer.buildBlockPageUrl(match, originalUrl)
        if (updatedUrl == lastWebsiteNavUrl[browserPackage]) return
        if (BrowserUrlAccess.navigateToUrl(this, browserPackage, updatedUrl)) {
            lastWebsiteNavUrl[browserPackage] = updatedUrl
            lastWebsiteNavAt[browserPackage] = System.currentTimeMillis()
        }
    }

    private fun navigateBrowserToBlockPage(
        browserPackage: String,
        match: BlockMatch,
        originalUrl: String
    ) {
        val blockUrl = try {
            blockPageServer.buildBlockPageUrl(match, originalUrl)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build block page URL", e)
            showWebsiteBlockOverlayFallback(match)
            return
        }

        val now = System.currentTimeMillis()
        val lastNav = lastWebsiteNavAt[browserPackage] ?: 0L
        val lastUrl = lastWebsiteNavUrl[browserPackage]
        if (lastUrl == blockUrl && now - lastNav < WEBSITE_NAV_COOLDOWN_MS) {
            return
        }

        val targetKey = "site:${match.blockedDomain}"
        val lastShown = lastBlockTimeByTarget[targetKey] ?: 0L
        if (now - lastShown < BLOCK_THROTTLE_SAME_TARGET_MS) return

        Log.d(
            TAG,
            "Blocking website ${match.blockedLabel} for blocklist ${match.blocklistName}"
        )
        lastBlockTimeByTarget[targetKey] = now

        if (blockOverlay.isShowing()) {
            blockOverlay.destroy()
        }

        if (BrowserUrlAccess.navigateToUrl(this, browserPackage, blockUrl)) {
            lastWebsiteNavAt[browserPackage] = now
            lastWebsiteNavUrl[browserPackage] = blockUrl
        } else {
            Log.w(TAG, "In-tab navigation failed for $browserPackage, using overlay fallback")
            showWebsiteBlockOverlayFallback(match)
        }
    }

    private fun showWebsiteBlockOverlayFallback(match: BlockMatch) {
        val targetKey = "site:${match.blockedDomain}"
        if (blockOverlay.isShowingFor(targetKey)) {
            blockOverlay.show(match)
            return
        }
        blockOverlay.show(match)
    }

    private fun showAppBlockOverlay(match: BlockMatch) {
        if (match.blockKind != BlockKind.APP) return

        val targetKey = "app:${match.blockedPackage}"
        if (blockOverlay.isShowingFor(targetKey)) {
            blockOverlay.show(match)
            return
        }

        val now = System.currentTimeMillis()
        val lastShown = lastBlockTimeByTarget[targetKey] ?: 0L
        if (now - lastShown < BLOCK_THROTTLE_SAME_TARGET_MS) return

        Log.d(
            TAG,
            "Blocking app ${match.blockedLabel} for blocklist ${match.blocklistName}"
        )
        lastBlockTimeByTarget[targetKey] = now
        blockOverlay.show(match)
    }

    private fun readBrowserUrl(
        browserPackage: String,
        allowFocusedUrlBar: Boolean
    ): String? {
        val rootsToRecycle = mutableListOf<AccessibilityNodeInfo>()
        try {
            rootInActiveWindow?.let { rootsToRecycle.add(it) }
            for (root in rootsToRecycle) {
                val url = BrowserUrlAccess.readUrl(
                    root,
                    browserPackage,
                    allowFocusedUrlBar,
                    isPendingNavigationUrl = ::isPendingBlockPageNavigation
                )
                if (url != null) return url
            }
            return null
        } finally {
            rootsToRecycle.forEach { it.recycle() }
        }
    }

    private fun checkCurrentBrowserUrl(allowFocusedUrlBar: Boolean) {
        val root = rootInActiveWindow ?: return
        try {
            val pkg = root.packageName?.toString() ?: return
            if (!BrowserUrlAccess.isSupportedBrowser(pkg)) return
            maybeBlockBrowserWebsite(pkg, force = true) {
                readBrowserUrl(pkg, allowFocusedUrlBar)
            }
        } finally {
            root.recycle()
        }
    }

    /** URL bar may already contain the block-page URL while navigation completes. */
    private fun isPendingBlockPageNavigation(url: String): Boolean {
        return blockPageServer.isBlockPageUrl(url)
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
            blockOverlay.destroy()
        }
        if (::blockPageServer.isInitialized) {
            blockPageServer.stop()
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
