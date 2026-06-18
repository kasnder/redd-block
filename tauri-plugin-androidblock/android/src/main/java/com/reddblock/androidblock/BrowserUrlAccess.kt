package com.reddblock.androidblock

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat

/** Shared per-browser URL bar lookup for reading and setting the active tab URL. */
object BrowserUrlAccess {
    private const val TAG = "BrowserUrlAccess"

    private val browserUrlViewIds = mapOf(
        "com.android.chrome" to listOf("url_bar", "origin"),
        "com.chrome.beta" to listOf("url_bar"),
        "org.chromium.chrome" to listOf("url_bar"),
        "com.brave.browser" to listOf("url_bar"),
        "com.brave.browser_beta" to listOf("url_bar"),
        "com.brave.browser_nightly" to listOf("url_bar"),
        "com.sec.android.app.sbrowser" to listOf("location_bar_edit_text"),
        "com.microsoft.emmx" to listOf("url_bar"),
        "com.opera.browser" to listOf("url_field"),
        "com.opera.browser.beta" to listOf("url_field"),
        "com.opera.mini.native" to listOf("url_field"),
        "com.opera.mini.native.beta" to listOf("url_field"),
        "com.opera.touch" to listOf("addressbarEdit"),
        "com.vivaldi.browser" to listOf("url_bar"),
        "com.kiwibrowser.browser" to listOf("url_bar"),
        "com.duckduckgo.mobile.android" to listOf("omnibarTextInput"),
        "com.ecosia.android" to listOf("url_bar"),
        "com.huawei.browser" to listOf("url_bar"),
        "com.android.browser" to listOf("url"),
        "com.google.android.googlequicksearchbox" to listOf("googleapp_srp_search_box_text"),
    )

    private val browserGoButtonIds = mapOf(
        "com.android.chrome" to listOf("line_2", "reload_button"),
        "com.chrome.beta" to listOf("line_2", "reload_button"),
        "org.chromium.chrome" to listOf("line_2", "reload_button"),
        "com.brave.browser" to listOf("line_2", "reload_button"),
        "com.brave.browser_beta" to listOf("line_2", "reload_button"),
        "com.brave.browser_nightly" to listOf("line_2", "reload_button"),
        "com.microsoft.emmx" to listOf("refresh_button"),
        "com.sec.android.app.sbrowser" to listOf("refresh_button"),
    )

    fun isSupportedBrowser(packageName: String): Boolean {
        return packageName in browserUrlViewIds
    }

    fun readUrl(
        root: AccessibilityNodeInfo,
        browserPackage: String,
        allowFocusedUrlBar: Boolean,
        isPendingNavigationUrl: ((String) -> Boolean)? = null
    ): String? {
        if (isOmnibarEditing(root, browserPackage)) {
            return null
        }
        return readFromUrlBarNodes(root, browserPackage, allowFocusedUrlBar, isPendingNavigationUrl)
    }

    /** True while the visible URL field is actively being edited. */
    fun isOmnibarEditing(root: AccessibilityNodeInfo, browserPackage: String): Boolean {
        for (node in findUrlBarNodes(root, browserPackage)) {
            try {
                if (node.isFocused && node.isEditable) return true
            } finally {
                node.recycle()
            }
        }
        return false
    }

    private fun readFromUrlBarNodes(
        root: AccessibilityNodeInfo,
        browserPackage: String,
        allowFocusedUrlBar: Boolean,
        isPendingNavigationUrl: ((String) -> Boolean)? = null
    ): String? {
        for (node in findUrlBarNodes(root, browserPackage)) {
            try {
                val text = node.text?.toString()
                if (text != null && isPendingNavigationUrl?.invoke(text) == true) {
                    return text
                }
                if (!allowFocusedUrlBar && node.isFocused) continue
                if (text != null && isValidUrlFormat(text)) {
                    return text
                }
                val description = node.contentDescription?.toString()
                if (description != null && isValidUrlFormat(description)) {
                    return description
                }
            } finally {
                node.recycle()
            }
        }
        return null
    }

    fun navigateToUrl(
        service: AccessibilityService,
        browserPackage: String,
        url: String
    ): Boolean {
        if (navigateViaIntent(service, browserPackage, url)) {
            return true
        }
        return navigateViaAccessibility(service, browserPackage, url)
    }

    private fun navigateViaIntent(
        service: AccessibilityService,
        browserPackage: String,
        url: String
    ): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                setPackage(browserPackage)
            }
            service.startActivity(intent)
            Log.d(TAG, "Navigated $browserPackage via VIEW intent")
            true
        } catch (e: Exception) {
            Log.w(TAG, "VIEW intent navigation failed for $browserPackage", e)
            false
        }
    }

    private fun navigateViaAccessibility(
        service: AccessibilityService,
        browserPackage: String,
        url: String
    ): Boolean {
        val root = service.rootInActiveWindow ?: return false
        try {
            val urlNode = findUrlBarNodes(root, browserPackage).firstOrNull() ?: return false
            try {
                if (!urlNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)) {
                    urlNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                }
                val args = Bundle()
                args.putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    url
                )
                if (!urlNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) {
                    return false
                }
                if (submitUrlBar(root, browserPackage, urlNode)) {
                    return true
                }
                // Some browsers need a beat before IME enter is accepted.
                Handler(Looper.getMainLooper()).postDelayed({
                    val retryRoot = service.rootInActiveWindow ?: return@postDelayed
                    try {
                        val retryNode = findUrlBarNodes(retryRoot, browserPackage).firstOrNull()
                            ?: return@postDelayed
                        try {
                            submitUrlBar(retryRoot, browserPackage, retryNode)
                        } finally {
                            retryNode.recycle()
                        }
                    } finally {
                        retryRoot.recycle()
                    }
                }, 120)
                return true
            } finally {
                urlNode.recycle()
            }
        } finally {
            root.recycle()
        }
    }

    private fun clickGoButton(
        root: AccessibilityNodeInfo,
        browserPackage: String
    ): Boolean {
        val viewIds = browserGoButtonIds[browserPackage] ?: return false
        for (viewId in viewIds) {
            val nodes = root.findAccessibilityNodeInfosByViewId("$browserPackage:id/$viewId")
                ?: continue
            for (node in nodes) {
                try {
                    if (node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                        return true
                    }
                    for (i in 0 until node.childCount) {
                        node.getChild(i)?.let { child ->
                            try {
                                if (child.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                                    return true
                                }
                            } finally {
                                child.recycle()
                            }
                        }
                    }
                } finally {
                    node.recycle()
                }
            }
        }
        return false
    }

    private fun findNodesByViewId(
        root: AccessibilityNodeInfo,
        browserPackage: String,
        viewId: String
    ): List<AccessibilityNodeInfo> {
        return root.findAccessibilityNodeInfosByViewId("$browserPackage:id/$viewId") ?: emptyList()
    }

    private fun submitUrlBar(
        root: AccessibilityNodeInfo,
        browserPackage: String,
        urlNode: AccessibilityNodeInfo
    ): Boolean {
        val compat = AccessibilityNodeInfoCompat.wrap(urlNode)
        if (compat.performAction(ACTION_IME_ENTER)) {
            return true
        }
        if (clickGoButton(root, browserPackage)) {
            return true
        }
        return compat.performAction(AccessibilityNodeInfoCompat.ACTION_CLICK)
    }

    private fun findUrlBarNodes(
        root: AccessibilityNodeInfo,
        browserPackage: String
    ): List<AccessibilityNodeInfo> {
        val viewIds = browserUrlViewIds[browserPackage] ?: return emptyList()
        val nodes = mutableListOf<AccessibilityNodeInfo>()
        for (viewId in viewIds) {
            val found = root.findAccessibilityNodeInfosByViewId("$browserPackage:id/$viewId")
            if (!found.isNullOrEmpty()) {
                nodes.addAll(found)
            }
        }
        return nodes
    }

    fun isValidUrlFormat(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true
        if (trimmed.contains(" ") || trimmed.length < 4) return false
        val domainPattern = Regex("^[a-zA-Z0-9][a-zA-Z0-9.-]*\\.[a-zA-Z]{2,}(/.*)?$")
        return domainPattern.matches(trimmed)
    }

    /** [android.view.accessibility.AccessibilityNodeInfo.ACTION_IME_ENTER] (API 30+). */
    private const val ACTION_IME_ENTER = 0x01000000
}
