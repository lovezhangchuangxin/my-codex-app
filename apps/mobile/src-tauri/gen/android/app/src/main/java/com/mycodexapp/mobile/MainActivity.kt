package com.mycodexapp.mobile

import android.os.Bundle
import com.mycodexapp.mobile.BuildConfig
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var lastKeyboardInset = -1

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.Theme_my_codex_app_mobile)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    val insetsController = WindowCompat.getInsetsController(window, window.decorView)
    insetsController.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    insetsController.hide(WindowInsetsCompat.Type.statusBars())
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)

    // Allow the WebView (loaded from https://tauri.localhost in release builds)
    // to fetch plain-HTTP bridge endpoints on the LAN.
    webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

    // Enable WebView debugging in debug builds only (connect via chrome://inspect)
    if (BuildConfig.DEBUG) {
      android.webkit.WebView.setWebContentsDebuggingEnabled(true)
    }

    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, windowInsets ->
      val imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
      val systemBarInsets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
      val keyboardInset =
        if (windowInsets.isVisible(WindowInsetsCompat.Type.ime())) {
          maxOf(0, imeInsets.bottom - systemBarInsets.bottom)
        } else {
          0
        }

      if (keyboardInset != lastKeyboardInset) {
        lastKeyboardInset = keyboardInset
        webView.post {
          webView.evaluateJavascript(
            """
              window.dispatchEvent(
                new CustomEvent('tauri-keyboard-inset-change', {
                  detail: { height: $keyboardInset }
                })
              );
            """.trimIndent(),
            null,
          )
        }
      }

      windowInsets
    }
    ViewCompat.requestApplyInsets(webView)
  }
}
