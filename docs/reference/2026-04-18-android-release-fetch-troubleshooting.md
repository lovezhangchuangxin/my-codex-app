# Android Release Build "Failed to fetch" Troubleshooting & Fix

**Date**: 2026-04-18
**Symptom**: Tauri 2 Android release build cannot connect to the bridge (`Failed to fetch` error). Debug build works fine. Phone browser can access the bridge URL normally.

## Root Cause

Android WebView's CSP implementation does **not** match non-standard ports when using `http://*` as a source expression in `connect-src`. When the bridge runs at `http://192.168.1.7:8787`, the CSP `connect-src` value `http://*` fails to match this URL, causing the WebView to block all fetch requests.

Console error:

```
Refused to connect to 'http://192.168.1.7:8787/api/version' because it violates
the following Content Security Policy directive:
"connect-src 'self' http://localhost:5173 ws://localhost:5173 http://* https://* ws://* wss://*"
```

### Why debug builds are unaffected

Tauri 2 loads pages from an external dev server (`http://localhost:5173`) in debug mode, bypassing the custom protocol handler. CSP is therefore **not** injected as a response header and is not enforced. In release mode, pages load from the custom protocol origin (`http://tauri.localhost`), and CSP is injected via the custom protocol handler's response headers, where it is strictly enforced by the WebView.

### Why `http://*` doesn't work

Per the CSP Level 3 spec, `http://*` should theoretically match any HTTP URL. However, in Android WebView's (Chromium-based) implementation, source expressions with `*` as the host part handle ports differently and **do not match non-standard ports** (e.g., 8787). Using the standalone `*` wildcard (without a scheme prefix) correctly matches all URLs.

## Fix

### 1. Update CSP (core fix)

File: `apps/mobile/src-tauri/tauri.conf.json`

Change `connect-src` from scheme-specific wildcards to a global wildcard:

```diff
- "connect-src 'self' http://localhost:5173 ws://localhost:5173 http://* https://* ws://* wss://*; script-src ..."
+ "connect-src * data: blob:; script-src ..."
```

In CSP, `*` matches all URLs (excluding `data:`/`blob:`), which is appropriate for scenarios requiring connections to arbitrary LAN addresses.

### 2. Add mixed content mode support (defensive fix)

File: `apps/mobile/src-tauri/gen/android/app/src/main/java/com/mycodexapp/mobile/MainActivity.kt`

When `useHttpsScheme: true`, pages load from an HTTPS origin, so HTTPS→HTTP mixed content requests must be allowed:

```kotlin
override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.settings.mixedContentMode =
        android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
}
```

### 3. Ensure patch persistence

File: `apps/mobile/scripts/ensure-android-local-direct.mjs`

Tauri `android init` regenerates the Android shell, so a pre-build script ensures patches are not lost. Each patch checks for prior existence before applying (idempotent).

### 4. Enable WebView debugging (debug builds only)

Debug builds can enable WebView debugging for troubleshooting via Chrome DevTools:

```kotlin
if (BuildConfig.DEBUG) {
    android.webkit.WebView.setWebContentsDebuggingEnabled(true)
}
```

## Debugging Methods

1. **Chrome DevTools remote debugging**: Connect phone via USB → enter `chrome://inspect/#devices` in Chrome address bar → find the WebView → click inspect
2. **Console manual testing**:
   ```js
   // Check if bridge URL is stored
   localStorage.getItem('my-codex-app.bridge-target');
   // Test fetch directly
   fetch('http://<bridge-url>/healthz')
     .then((r) => r.text())
     .then(console.log)
     .catch(console.error);
   ```
3. **Network tab**: If requests don't appear in the Network tab, they were blocked at the WebView level (CSP/mixed content)

## Hypotheses Eliminated During Investigation

| Hypothesis                                              | Conclusion     | Reason                                                                                                    |
| ------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| CSP `http://*` blocking                                 | **Root cause** | Android WebView's CSP implementation does not match `http://*` against non-standard ports                 |
| Mixed content blocking                                  | Not applicable | `useHttpsScheme: false`, page loads from HTTP, no mixed content issue                                     |
| CORS                                                    | Not the cause  | Bridge defaults to `corsOrigins: ['*']`, OPTIONS preflight handled correctly                              |
| `usesCleartextTraffic`                                  | Not the cause  | Already set to `true`, and `network_security_config.xml` allows cleartext                                 |
| ProGuard/R8 stripping classes                           | Not the cause  | `RustWebViewClient`, `RustWebView`, etc. all have keep rules                                              |
| Rust custom protocol handler blocking external requests | Not the cause  | wry source confirms `handleRequest` returns `None` for non-custom-protocol URLs, WebView handles normally |

## Tauri 2 Android Request Flow Architecture

```
Release build (useHttpsScheme: false, withAssetLoader: false):
  WebView page: http://tauri.localhost/index.html
    │
    ├─ shouldInterceptRequest() called
    │   ├─ withAssetLoader() = false
    │   └─ handleRequest() (Rust native)
    │       ├─ URL matches tauri.localhost → serve local file + inject CSP header
    │       └─ URL is external (192.168.1.7:8787) → return None → WebView handles
    │
    └─ WebView enforces CSP from page's response headers
        ├─ connect-src: http://*  ← does not match port 8787
        └─ BLOCKED → "Failed to fetch"
```

## Follow-up Items

- [x] Make WebView debugging conditional on `BuildConfig.DEBUG`
- [x] Investigate `localStorage` returning null — confirmed working on re-test; initial null was likely a timing issue during first pairing
- [x] Restrict outgoing requests to configured bridge origin — runtime validation added in `BridgeClient.#buildUrl()`
