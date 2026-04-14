import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const gradleFile = resolve(
  process.cwd(),
  'src-tauri/gen/android/app/build.gradle.kts',
);
const manifestFile = resolve(
  process.cwd(),
  'src-tauri/gen/android/app/src/main/AndroidManifest.xml',
);
const mainActivityFile = resolve(
  process.cwd(),
  'src-tauri/gen/android/app/src/main/java/com/mycodexapp/mobile/MainActivity.kt',
);

function rewriteFileIfPresent(file, transform) {
  if (!existsSync(file)) {
    return;
  }

  const original = readFileSync(file, 'utf8');
  const next = transform(original);
  if (next !== original) {
    writeFileSync(file, next);
  }
}

rewriteFileIfPresent(gradleFile, (original) => {
  let seenPlaceholder = false;
  return original
    .split('\n')
    .flatMap((line) => {
      if (!line.includes('manifestPlaceholders["usesCleartextTraffic"]')) {
        return [line];
      }

      if (seenPlaceholder) {
        return [];
      }

      seenPlaceholder = true;
      return [line.replace(/"false"|"true"/, '"true"')];
    })
    .join('\n');
});

rewriteFileIfPresent(manifestFile, (original) => {
  if (original.includes('android:windowSoftInputMode="adjustResize"')) {
    return original.replace(
      /android:windowSoftInputMode="[^"]+"/,
      'android:windowSoftInputMode="adjustResize"',
    );
  }

  return original.replace(
    'android:exported="true">',
    'android:exported="true"\n            android:windowSoftInputMode="adjustResize">',
  );
});

rewriteFileIfPresent(mainActivityFile, (original) => {
  let next = original
    .replace('import android.util.Log\n', '')
    .replace(/^\s*Log\.i\("MyCodexAppKeyboard".*\n/gm, '')
    .replace(
      /^\s*window\.__MY_CODEX_APP_NATIVE_KEYBOARD_INSET__ = .*;\n/gm,
      '',
    );

  if (!next.includes('import android.webkit.WebView')) {
    next = next.replace(
      'import android.os.Bundle\n',
      'import android.os.Bundle\nimport android.webkit.WebView\n',
    );
  }

  if (!next.includes('import androidx.core.view.ViewCompat')) {
    next = next.replace(
      'import androidx.core.view.WindowCompat\n',
      'import androidx.core.view.ViewCompat\nimport androidx.core.view.WindowCompat\n',
    );
  }

  if (!next.includes('private var lastKeyboardInset = -1')) {
    next = next.replace(
      'class MainActivity : TauriActivity() {\n',
      'class MainActivity : TauriActivity() {\n  private var lastKeyboardInset = -1\n\n',
    );
  }

  if (!next.includes('window.dispatchEvent(')) {
    next = next.replace(
      '\n}\n',
      `

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
`,
    );
  }

  return next;
});
