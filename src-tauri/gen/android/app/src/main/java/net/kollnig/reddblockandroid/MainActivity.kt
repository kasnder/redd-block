package net.kollnig.reddblockandroid

import android.graphics.Color
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Edge-to-edge is enforced on Android 15+ (targetSdk 35+), so the
    // webview would draw underneath the status/navigation bars — and
    // Android WebView doesn't reliably surface those regions to CSS via
    // env(safe-area-inset-*) the way WKWebView does on iOS. Apply the
    // system-bar (+ keyboard) insets as native padding instead, so the
    // web content always sits between the bars. Colour that padding to
    // match the app canvas (#F7F5F0) so it isn't white.
    val content = findViewById<android.view.View>(android.R.id.content)
    content.setBackgroundColor(Color.parseColor("#F7F5F0"))
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars()
          or WindowInsetsCompat.Type.displayCutout()
          or WindowInsetsCompat.Type.ime()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
