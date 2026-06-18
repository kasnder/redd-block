package com.reddblock

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var pendingSafeAreaTopCss: String? = null
  private var pendingSafeAreaBottomCss: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val navigationBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      val topPx = max(bars.top, cutout.top).coerceAtLeast(statusBarHeightFallback())
      val bottomPx = max(bars.bottom, cutout.bottom, navigationBars.bottom)
        .coerceAtLeast(navigationBarHeightFallback())
      applyNativeSafeAreaTop(topPx)
      applyNativeSafeAreaBottom(bottomPx)
      insets
    }
    ViewCompat.requestApplyInsets(window.decorView)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    pendingSafeAreaTopCss?.let { pushSafeAreaTopToWebView(it) }
    pendingSafeAreaBottomCss?.let { pushSafeAreaBottomToWebView(it) }
    ViewCompat.getRootWindowInsets(window.decorView)?.let { insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val navigationBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      val topPx = max(bars.top, cutout.top).coerceAtLeast(statusBarHeightFallback())
      val bottomPx = max(bars.bottom, cutout.bottom, navigationBars.bottom)
        .coerceAtLeast(navigationBarHeightFallback())
      applyNativeSafeAreaTop(topPx)
      applyNativeSafeAreaBottom(bottomPx)
    }
  }

  private fun applyNativeSafeAreaTop(topPx: Int) {
    val cssPx = topPx / resources.displayMetrics.density
    pushSafeAreaTopToWebView("${cssPx}px")
  }

  private fun applyNativeSafeAreaBottom(bottomPx: Int) {
    val cssPx = bottomPx / resources.displayMetrics.density
    pushSafeAreaBottomToWebView("${cssPx}px")
  }

  private fun pushSafeAreaTopToWebView(value: String) {
    pendingSafeAreaTopCss = value
    val view = webView ?: return
    view.post {
      view.evaluateJavascript(
        "document.documentElement.style.setProperty('--android-native-safe-area-top','$value');",
        null,
      )
    }
  }

  private fun pushSafeAreaBottomToWebView(value: String) {
    pendingSafeAreaBottomCss = value
    val view = webView ?: return
    view.post {
      view.evaluateJavascript(
        "document.documentElement.style.setProperty('--android-native-safe-area-bottom','$value');",
        null,
      )
    }
  }

  private fun statusBarHeightFallback(): Int {
    val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
  }

  private fun navigationBarHeightFallback(): Int {
    val resourceId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
    return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
  }
}
