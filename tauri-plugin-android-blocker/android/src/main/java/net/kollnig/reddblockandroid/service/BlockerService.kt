package net.kollnig.reddblockandroid.service

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import net.kollnig.reddblockandroid.gate.UnlockActivity
import net.kollnig.reddblockandroid.schedule.Schedules

import net.kollnig.reddblockandroid.util.isPrefsInitialized
import net.kollnig.reddblockandroid.util.prefs
import androidx.core.net.toUri

@SuppressLint("AccessibilityPolicy")
class BlockerService : AccessibilityService() {

    private var lastCheckedUrl: String? = null
    private var lastUrlCheckTime: Long = 0
    private val URL_CHECK_THROTTLE_MS = 500L

    private var lastBlockedPkg: String? = null
    private var lastBlockedTime: Long = 0
    private val APP_BLOCK_THROTTLE_MS = 2000L
    private val skippablePackageCache = mutableMapOf<String, Boolean>()
    private val appLabelCache = mutableMapOf<String, String>()

    override fun onServiceConnected() {
        super.onServiceConnected()

        if (!isPrefsInitialized) {
            val deviceContext = createDeviceProtectedStorageContext()
            prefs = deviceContext.getSharedPreferences("prefs", MODE_PRIVATE)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        val keyguardManager = getSystemService(KEYGUARD_SERVICE) as android.app.KeyguardManager
        if (keyguardManager.isKeyguardLocked) return

        val isContentChanged = event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        val isWindowChanged = event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED
        if (!isContentChanged && !isWindowChanged) return

        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return

        // Website URL extraction is the expensive path because it may inspect
        // the browser accessibility tree. Only do it for content changes in
        // supported browsers while at least one website block can be active.
        if (isContentChanged && isSupportedBrowser(pkg) && Schedules.hasWebsiteBlockingCandidates()) {
            val currentTime = System.currentTimeMillis()
            if (currentTime - lastUrlCheckTime >= URL_CHECK_THROTTLE_MS) {
                lastUrlCheckTime = currentTime
                val url = extractUrlFromEvent(event)
                if (url != null) {
                    if (url != lastCheckedUrl) {
                        lastCheckedUrl = url
                        val domain = extractDomain(url)
                        if (domain != null) {
                            val blockingSchedule = Schedules.findBlockingScheduleForWebsite(domain)
                            if (blockingSchedule != null) {
                                Log.d(TAG, "Blocking website $domain in browser ($pkg)")
                                navigateBrowserToBlank(pkg)
                                launchFrictionGate(blockingSchedule.id, blockingSchedule.name, domain, isWebsite = true)
                                return
                            }
                        }
                    }
                }
            }
        }

        // Check app blocking
        if (!Schedules.hasAppBlockingCandidates()) return
        if (shouldSkipPackage(pkg)) return

        val blockingSchedule = Schedules.findBlockingScheduleForApp(pkg)
        if (blockingSchedule != null) {
            val now = System.currentTimeMillis()
            if (pkg != lastBlockedPkg || now - lastBlockedTime >= APP_BLOCK_THROTTLE_MS) {
                lastBlockedPkg = pkg
                lastBlockedTime = now
                Log.d(TAG, "Blocking app $pkg by schedule: $blockingSchedule")
                val appLabel = getAppLabel(pkg)
                launchFrictionGate(blockingSchedule.id, blockingSchedule.name, appLabel, isWebsite = false)
            }
        }
    }

    /**
     * Launches the native [UnlockActivity] friction gate with the block
     * details as extras. A native activity appears near-instantly, unlike
     * the Tauri main activity, whose webview cold start (Rust init + JS
     * bundle load) took several seconds — unacceptable for an
     * interception surface. On success UnlockActivity pauses the schedule
     * directly in Kotlin; the webview reconciles via `getScheduleStates`
     * on its next resume.
     */
    private fun launchFrictionGate(
        scheduleId: String,
        scheduleName: String,
        blockedTarget: String,
        isWebsite: Boolean,
    ) {
        val intent = Intent(this, UnlockActivity::class.java).apply {
            putExtra(UnlockActivity.EXTRA_SCHEDULE_ID, scheduleId)
            putExtra(UnlockActivity.EXTRA_SCHEDULE_NAME, scheduleName)
            putExtra(UnlockActivity.EXTRA_BLOCKED_TARGET, blockedTarget)
            putExtra(UnlockActivity.EXTRA_IS_WEBSITE, isWebsite)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        startActivity(intent)
    }

    private fun getAppLabel(packageName: String): String {
        appLabelCache[packageName]?.let { return it }
        val label = try {
            this.packageManager.getApplicationLabel(
                this.packageManager.getApplicationInfo(packageName, 0)
            ).toString()
        } catch (_: Exception) {
            packageName
        }
        appLabelCache[packageName] = label
        return label
    }

    private fun shouldSkipPackage(packageName: String): Boolean {
        skippablePackageCache[packageName]?.let { return it }
        val shouldSkip = try {
            val info = this.packageManager.getApplicationInfo(packageName, 0)
            val isSystem = (info.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
            if (isSystem) {
                this.packageManager.getLaunchIntentForPackage(packageName) == null
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
        skippablePackageCache[packageName] = shouldSkip
        return shouldSkip
    }

    private fun isSupportedBrowser(packageName: String): Boolean =
        BrowserUrlParser.isSupportedBrowser(packageName)

    private fun navigateBrowserToBlank(browserPackage: String) {
        try {
            val uri = "https://digitalhabits.org".toUri()
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                setPackage(browserPackage)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            lastCheckedUrl = null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to navigate browser to blocked page", e)
            performGlobalAction(GLOBAL_ACTION_HOME)
        }
    }

    private fun extractUrlFromEvent(event: AccessibilityEvent): String? {
        val root = rootInActiveWindow ?: return null
        try {
            val pkg = event.packageName?.toString() ?: return null
            val viewIds = BrowserUrlParser.browserUrlViewIds[pkg] ?: return null
            val knownUrlViewIds = viewIds.map { "$pkg:id/$it" } + viewIds

            // First try the standard API with fully-qualified resource IDs
            for (viewId in knownUrlViewIds) {
                val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
                if (nodes.isNullOrEmpty()) continue
                val url = extractUrlFromNodes(nodes)
                if (url != null) return url
            }

            // Fallback: manually traverse the tree to find nodes by bare resource-id.
            // Newer browsers (e.g. Firefox with Jetpack Compose) use test tags as
            // resource-ids without the "package:id/" prefix, which
            // findAccessibilityNodeInfosByViewId cannot match.
            val bareIds = viewIds.toSet()
            val fallbackNodes = mutableListOf<android.view.accessibility.AccessibilityNodeInfo>()
            findNodesByBareResourceId(root, bareIds, fallbackNodes)
            if (fallbackNodes.isNotEmpty()) {
                val url = extractUrlFromNodes(fallbackNodes)
                if (url != null) return url
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting URL", e)
        } finally {
            root.recycle()
        }
        return null
    }

    private fun extractUrlFromNodes(
        nodes: List<android.view.accessibility.AccessibilityNodeInfo>
    ): String? {
        for (node in nodes) {
            try {
                // Skip if the URL bar is focused — user is typing,
                // don't block on autocomplete suggestions
                if (node.isFocused) continue
                val rawText = node.text?.toString()?.takeIf { it.isNotBlank() }
                    ?: node.contentDescription?.toString()
                if (rawText != null) {
                    BrowserUrlParser.findUrlInText(rawText)?.let { return it }
                }
            } finally {
                node.recycle()
            }
        }
        return null
    }

    /** Recursively walks the accessibility tree looking for nodes whose
     *  viewIdResourceName matches one of [targetIds] (bare, without package prefix). */
    private fun findNodesByBareResourceId(
        node: android.view.accessibility.AccessibilityNodeInfo,
        targetIds: Set<String>,
        results: MutableList<android.view.accessibility.AccessibilityNodeInfo>
    ) {
        val resName = node.viewIdResourceName
        if (resName != null && resName in targetIds) {
            results.add(android.view.accessibility.AccessibilityNodeInfo.obtain(node))
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findNodesByBareResourceId(child, targetIds, results)
            child.recycle()
        }
    }

    private fun extractDomain(url: String): String? =
        BrowserUrlParser.extractDomain(url)
            ?: run { Log.e(TAG, "Error extracting domain from URL: $url"); null }

    override fun onInterrupt() {}

    companion object {
        private const val TAG = "BlockerService"
        // Canonical definitions live on the consumer, UnlockActivity;
        // aliased here because BlockerPlugin historically reads them
        // from BlockerService for the (legacy) webview friction gate.
        const val EXTRA_SCHEDULE_ID = UnlockActivity.EXTRA_SCHEDULE_ID
        const val EXTRA_SCHEDULE_NAME = UnlockActivity.EXTRA_SCHEDULE_NAME
        const val EXTRA_BLOCKED_TARGET = UnlockActivity.EXTRA_BLOCKED_TARGET
    }
}
