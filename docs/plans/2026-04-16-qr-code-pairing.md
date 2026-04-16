# QR Code Pairing — Implementation Plan

Companion to `docs/specs/2026-04-16-qr-code-pairing.md`.

## Dependencies

### Bridge (`apps/bridge`)

```bash
pnpm --dir apps/bridge add qrcode-terminal
pnpm --dir apps/bridge add -D @types/qrcode-terminal
```

### Client (`apps/client`)

```bash
pnpm --dir apps/client add @yudiel/react-qr-scanner
```

## Implementation Order

Tasks are ordered by dependency. Each task produces a testable increment.

### Task 1: Bridge — Terminal QR rendering

**Files to modify:**

- `apps/bridge/src/server/logging.ts` — add QR output next to pairing code text
- `apps/bridge/src/server.ts` — pass bridge URL to `logPairingStatus()` for QR encoding

**Approach:**

1. `logPairingStatus()` accepts an additional `bridgeUrl: string` parameter.
2. Build QR payload: `${bridgeUrl}/pair?code=${pairingCode}`.
3. Call `qrcode.generate(payload, { small: true })` to render inline in terminal.
4. Print above the existing pairing code line.

**Expected terminal output:**

```
Bridge listening on http://192.168.1.100:8787

Scan QR code to pair your device:

 █████████████████████
 ██                ██
 ██   (QR code)    ██
 ██                ██
 █████████████████████

Pairing code: ABCD1234 (expires at 2026-04-16T12:00:00.000Z)
```

**Verification:** Run `pnpm dev:bridge`, confirm QR renders in terminal and the encoded URL opens in a browser.

---

### Task 2: Client — URL parameter auto-pairing

**Files to modify:**

- `apps/client/src/components/pairing/pairing-screen.tsx` — read `?bridge` and `?code` from URL search params

**Approach:**

1. On mount, read `bridge` and `code` from `URLSearchParams`.
2. If both present: auto-fill `bridgeTarget` and `pairingCode` state, then auto-submit.
3. If only `code` present and `bridgeTarget` already resolves: auto-submit.
4. After consumption, replace URL to clear params (avoid re-submit on refresh).
5. Show a brief "pairing..." state during auto-submit.

**Key details:**

- Use `window.location.search` + `URLSearchParams` (React Router v7 compatible).
- Auto-submit only when bridge is `reachable` (reuse existing health check).
- On auto-submit failure, show error but keep fields filled for manual retry.

**Verification:** Open `http://localhost:5173/pair?bridge=http://localhost:8787&code=ABCD1234` with bridge running, confirm auto-pairing.

---

### Task 3: Client — QR scanner component

**Files to create:**

- `apps/client/src/components/pairing/qr-scanner.tsx` — wrapper around `@yudiel/react-qr-scanner`

**Approach:**

1. Create a `QrScanner` component that:
   - Renders the `Scanner` from `@yudiel/react-qr-scanner` with `facingMode: 'environment'` (rear camera).
   - Restricts `formats` to `['qr_code']`.
   - On successful scan: parses the URL, extracts `bridge` origin + `code` query param, calls `onScan(result)` callback.
   - On error: calls `onError(error)` callback.
   - Shows a viewfinder overlay with scanning hint text.
2. Handle camera unavailability gracefully:
   - Permission denied → `onError` with specific message.
   - Not supported (HTTP non-localhost) → `onError` with specific message.
3. Component is lazy-loaded (`React.lazy`) to avoid impacting initial bundle size.

**Parsed QR content handling:**

- If scanned text is a URL matching pattern `http(s)://.../pair?code=...`:
  - `bridge` = URL origin (e.g. `http://192.168.1.100:8787`)
  - `code` = `code` query param value
- Otherwise: treat as invalid QR, show error.

**Verification:** Render component in /pair page, scan a test QR, confirm correct parsing.

---

### Task 4: Client — /pair page QR scan integration

**Files to modify:**

- `apps/client/src/components/pairing/pairing-screen.tsx` — add scan mode toggle and scanner UI

**Approach:**

1. Add a `view` state: `'form' | 'scanner'`.
2. Default is `'form'` (existing form).
3. Add a "Scan QR Code" button below the pairing code input (secondary style, with `QrCode` icon from lucide-react).
4. Tapping "Scan QR Code" switches to `'scanner'` view:
   - Shows a header with back button ("← Back to manual entry").
   - Renders the `QrScanner` component (lazy-loaded).
   - On scan success: auto-fill form fields, switch back to `'form'` view, auto-submit.
   - On scan error: show error alert with fallback message.
5. Camera unavailable state:
   - If `onError` indicates camera not available, show "Camera not available" message and auto-switch back to `'form'`.

**Layout for form view (updated):**

```
┌──────────────────────────────┐
│  [icon]  Pair your device     │
│  Enter the pairing code...    │
│                               │
│  Bridge URL: [____________]   │
│  Pairing code: [__________]   │
│                               │
│  Run `pnpm dev:bridge` ...    │
│                               │
│  [📷 Scan QR Code]           │
│  [ Connect ]                  │
└──────────────────────────────┘
```

**Layout for scanner view:**

```
┌──────────────────────────────┐
│  ← Back    Scan QR Code      │
│                               │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │   Camera viewfinder    │  │
│  │                        │  │
│  └────────────────────────┘  │
│                               │
│  Point at the QR code on     │
│  your bridge terminal        │
└──────────────────────────────┘
```

**Verification:** Full flow: bridge shows QR → /pair scan → auto-pair → redirect to /threads.

---

### Task 5: i18n messages

**Files to modify:**

- `apps/client/src/lib/i18n/messages/en.ts` — add English strings
- `apps/client/src/lib/i18n/messages/zh-CN.ts` — add Chinese strings

**New keys:**

| Key                         | English                                                              | Chinese                                  |
| --------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| `pairing.scanQr`            | Scan QR Code                                                         | 扫描二维码                               |
| `pairing.scanning`          | Scanning...                                                          | 扫描中...                                |
| `pairing.scanQrHint`        | Point your camera at the QR code on the bridge terminal              | 将摄像头对准 Bridge 终端上的二维码       |
| `pairing.cameraUnavailable` | Camera not available. Please enter the code manually.                | 摄像头不可用，请手动输入配对码。         |
| `pairing.scanFailed`        | Could not read QR code. Please try again or enter the code manually. | 无法识别二维码，请重试或手动输入配对码。 |
| `pairing.backToManual`      | Back to manual entry                                                 | 返回手动输入                             |
| `pairing.autoPairing`       | Pairing automatically...                                             | 自动配对中...                            |

**Verification:** Switch language, confirm all new strings render correctly.

---

### Task 6: Tauri camera permission (if needed)

**Files to potentially modify:**

- `apps/mobile/src-tauri/capabilities/default.json` — may need camera permission
- `apps/mobile/src-tauri/Cargo.toml` — may need Tauri camera plugin

**Approach:**

1. Test QR scanning in Tauri Android/iOS WebView first.
2. If camera works out of the box (WebView handles permissions), no changes needed.
3. If camera is blocked, add `camera` capability to Tauri config.
4. Document any platform-specific requirements.

**Verification:** Build and test on Android emulator with camera access.

---

## Verification Checklist

After all tasks:

- [ ] `pnpm build` passes with no type errors
- [ ] `pnpm fmt` passes
- [ ] Bridge terminal renders QR code alongside pairing code
- [ ] Bridge QR encodes correct URL (`{bridgeUrl}/pair?code={code}`)
- [ ] /pair page "Scan QR" button opens camera scanner
- [ ] Scanning bridge QR auto-fills and auto-submits pairing
- [ ] /pair page accepts `?bridge=...&code=...` URL params for auto-pairing
- [ ] Camera unavailability shows graceful fallback message
- [ ] Manual code entry still works (regression)
- [ ] i18n strings render in both English and Chinese
- [ ] No bundle size regression (scanner is lazy-loaded)

## Rollback

Each task is independently reversible. The QR feature is additive — removing the scan button and bridge QR rendering reverts to the current manual-only flow without breaking existing functionality.
