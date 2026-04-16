package com.mycodexapp.mobile

import android.os.Bundle
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
