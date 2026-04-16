# QR Code Pairing

## Background

The `/pair` page currently requires users to manually type a bridge URL and pairing code. This is error-prone and tedious on mobile devices, especially when the bridge URL is a LAN IP address.

The bridge terminal already displays a pairing code; adding a QR code to the terminal output allows mobile users to scan and pair instantly.

## Goal

Add QR code scanning to the `/pair` page so mobile users can pair by scanning a QR code displayed in the bridge terminal, without manual code entry.

## Scope

### In scope

1. **Bridge terminal**: Render a QR code in the terminal when a pairing code is generated.
2. **Client /pair page**: Add a camera-based QR scanner that auto-fills the bridge URL and pairing code, then auto-submits pairing.
3. **QR content format**: Define a URL scheme that encodes both bridge URL and pairing code.
4. **URL deep-link support**: The `/pair` page accepts `?bridge=...&code=...` query params for direct link pairing (useful when QR is scanned by a camera app that opens the browser instead of the in-app scanner).
5. **Fallback**: Keep existing manual code entry as the default/fallback path.

### Out of scope

- Displaying QR codes on the client side (client-to-client QR display).
- Relay-based remote pairing QR codes (local network only).
- Native Tauri camera plugin (use browser `getUserMedia` API for now; works in both browser and Tauri WebView).

## User Flow

### Primary flow: QR scan

1. User runs `pnpm dev:bridge` on their computer.
2. Bridge terminal shows a QR code alongside the pairing code text.
3. Mobile user opens the client `/pair` page.
4. User taps the "Scan QR" button.
5. Camera viewfinder opens; user points it at the bridge terminal QR code.
6. Client parses the QR content, extracts bridge URL + pairing code.
7. Client auto-fills both fields and submits pairing.
8. On success, redirects to `/threads`.

### Fallback flow: Manual entry (existing, unchanged)

1. User manually types the bridge URL and pairing code.
2. Submits the form.

### Deep-link flow: URL params

1. A camera app scans the QR and opens the URL in the browser.
2. The URL contains `?bridge=http://...&code=ABCD1234`.
3. The `/pair` page auto-fills and auto-submits.

## QR Content Format

The QR code encodes a URL:

```
http://{bridgeHost}:{port}/pair?code={pairingCode}
```

Rationale: This is a valid URL that any QR scanner app can open. The client `/pair` page can also parse it when scanned internally.

- `bridgeHost:port` — the actual bridge listen address (e.g. `192.168.1.100:8787`)
- `pairingCode` — the current 8-character pairing code

The client scanner parses this URL and extracts:

- `bridge` = `http://{bridgeHost}:{port}` (origin from the URL)
- `code` = `{pairingCode}` (from query param)

## Bridge Changes

### Terminal QR rendering

When a pairing code is generated or displayed, render a QR code in the terminal output using `qrcode-terminal` (zero-config, terminal-only, no browser deps).

Output format in bridge terminal:

```
Pairing code: ABCD1234 (expires in 10:00)
Scan QR code to pair:

 ████████████████████
 ██              ██
 ██   QR CODE   ██
 ██              ██
 ████████████████████
```

### Dependencies

- `qrcode-terminal` — terminal QR code rendering (bridge only, Node.js)

## Client Changes

### /pair page redesign

The pairing form gains a secondary "Scan QR" action alongside the existing manual entry form.

Layout:

```
┌─────────────────────────────┐
│    [icon]  Pair your device  │
│  Enter the pairing code...   │
│                              │
│  ┌──────────────────────┐   │
│  │  Bridge URL input    │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │  Pairing code input  │   │
│  └──────────────────────┘   │
│                              │
│  [ Scan QR Code ]           │
│  [ Connect ]                │
└─────────────────────────────┘
```

When "Scan QR" is tapped:

```
┌─────────────────────────────┐
│  ←   Scan QR Code           │
│                              │
│  ┌──────────────────────┐   │
│  │                      │   │
│  │   Camera viewfinder  │   │
│  │                      │   │
│  └──────────────────────┘   │
│                              │
│  Point at the QR code on    │
│  your bridge terminal       │
└─────────────────────────────┘
```

### QR scanning library

Use `@yudiel/react-qr-scanner` (or equivalent lightweight browser-based scanner):

- Browser-native `getUserMedia` for camera access.
- Decodes QR from camera frames using `jsQR` internally.
- Works in Chrome, Safari, Firefox, and Tauri WebView.

Fallback when camera is unavailable (e.g. HTTP non-localhost on some browsers):

- Show a message: "Camera not available. Please enter the code manually."
- Keep manual entry form accessible.

### URL parameter support

The `/pair` page reads `bridge` and `code` from URL search params on mount:

- If both are present and bridge is reachable, auto-submit pairing.
- If only `code` is present and bridge target is already set, auto-submit.
- Params are consumed (cleared from URL) after use to avoid re-submission on refresh.

### Dependencies

- A browser-based QR scanner package (to be evaluated: `@yudiel/react-qr-scanner`, `html5-qrcode`, or `@zxing/browser`)

## Protocol Changes

No protocol type changes required. The existing `PairingStatusResponse` already carries all needed data. The QR format is derived client-side from bridge URL + pairing code.

## i18n

New keys needed:

```
pairing.scanQr=Scan QR Code
pairing.scanning=Scanning...
pairing.scanQrHint=Point your camera at the QR code on the bridge terminal
pairing.cameraUnavailable=Camera not available. Please enter the code manually.
pairing.scanFailed=Could not read QR code. Please try again or enter the code manually.
```

## Error Handling

| Scenario                                  | Behavior                                             |
| ----------------------------------------- | ---------------------------------------------------- |
| Camera permission denied                  | Show "camera unavailable" message, keep manual entry |
| Camera not supported (HTTP non-localhost) | Show "camera unavailable" message                    |
| QR scanned but content is invalid         | Show "invalid QR code" error                         |
| QR scanned but pairing code expired       | Show bridge error message, allow retry               |
| QR scanned but bridge unreachable         | Show bridge unreachable alert                        |
| Auto-submit via URL params fails          | Show error, keep form filled for manual retry        |

## Security Considerations

- QR content is a plain HTTP URL (local network, no HTTPS on LAN). This is acceptable because:
  - The pairing code is single-use and short-lived (10 min).
  - The bridge is only accessible on the local network.
  - Intercepting the QR only reveals a temporary pairing code, not a session token.
- Camera access requires user permission (browser-enforced).
- URL param auto-submit still goes through the normal pairing validation on the bridge side.

## Risks

- **Camera in Tauri WebView**: May require additional permissions configuration in Tauri. Need to verify during implementation.
- **QR scanner library size**: Should evaluate bundle size impact; prefer tree-shakeable or minimal libraries.
- **Terminal font support**: `qrcode-terminal` uses block characters; some terminals may not render well. The text pairing code remains as fallback.
