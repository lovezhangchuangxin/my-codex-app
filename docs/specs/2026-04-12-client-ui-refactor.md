# Client UI Refactor Spec

## Relationship To Existing Docs

This spec supersedes the UI architecture described in:

- `docs/specs/2026-04-10-client-frontend-rebuild.md`

It does not change the platform architecture, bridge protocol, SDK surface, or auth model. It restructures the client routing, layouts, and component boundaries to improve the mobile-first user experience.

The approved design proposal lives at:

- `docs/proposals/2026-04-12-client-ui-refactor.md`

## Historical Status

This document remains the product-level UI refactor spec, but detailed module
ownership and file layout were later refined by:

- `docs/specs/2026-04-13-project-centered-threads-home.md`
- `docs/specs/2026-04-12-thread-chat-flow.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`
- `docs/specs/2026-04-13-client-modular-refactor.md`

Current implementation rule:

- thread and request business UI lives under `features/*`
- `components/*` is reserved for app chrome, pairing, settings, common
  renderers, and UI primitives
- the `/threads` page hierarchy described below should be read as historical
  where it conflicts with the newer project-centered threads home spec

## Background

The current client has three top-level routes (`/threads`, `/inbox`, `/connection`) with a desktop-first layout (272px sidebar + bottom tab bar). This creates several problems:

1. **Pairing is hidden inside a settings page.** Users must find the Connection page, fill in four manual fields (pairing code, device label, platform, device ID), and submit. Without pairing the app is useless, but the pairing form sits alongside developer diagnostics (health checks, runtime snapshots).

2. **Desktop-first layout on a mobile-primary product.** The core use case is a phone connecting to Codex on a desktop. The current UI gives mobile a compressed version of the desktop layout rather than a purpose-built mobile experience.

3. **Inbox is a separate page for tightly coupled workflow.** Pending approval requests belong to threads. Forcing users to navigate between Threads and Inbox to review and act on requests creates unnecessary context switching.

4. **Connection page exposes developer internals.** The 556-line Connection route includes runtime snapshots, manual health checks, raw device IDs, and "regenerate draft device" buttons. These are debugging tools, not user-facing features.

## Goals

- **Mobile-first architecture.** Design the mobile experience as the primary target. Desktop gets a natural widescreen extension.
- **Pairing as a gate.** Unauthenticated users see a full-screen pairing page and cannot access the rest of the app until paired.
- **Single workspace.** After authentication, the user lives in one view (`/threads`) that handles thread browsing, detail viewing, and request handling without page navigation.
- **Minimal pairing friction.** Only the pairing code is user input. Device label, platform, and device ID are auto-detected.
- **Simplified settings.** Connection management and device list move into a compact settings sheet. No runtime snapshots, no manual health checks, no raw protocol details.

## Non-Goals

- Changing the bridge protocol, SDK surface, or authentication model.
- Adding new features (voice, push notifications, multi-relay, etc.).
- Changing the tech stack (React, Tailwind, shadcn, Radix UI, Lucide).
- Redesigning the visual theme (colors, typography remain the same).
- Tauri-specific native integration in this iteration.

## Route Structure

### Before

```
/              → redirect to /threads
/threads       → ThreadsShell (thread list + thread detail)
/threads/:id   → ThreadsShell (specific thread)
/inbox         → InboxPanel (pending requests across threads)
/connection    → ConnectionRoute (bridge session, pairing, devices)
*              → redirect to /threads
```

### After

```
/              → redirect based on auth state
/pair          → PairingScreen (unauthenticated gate)
/threads       → ThreadsLayout (thread list + thread detail)
/threads/:id   → ThreadsLayout (specific thread)
*              → redirect to /
```

### Auth gate logic

The root layout reads the runtime snapshot connection state:

| Connection state | Behavior |
|-----------------|----------|
| `authenticated`, `refreshing`, `resyncing` | Allow access to `/threads`, redirect away from `/pair` |
| `unpaired`, `expired`, `revoked` | Redirect to `/pair`, block access to `/threads` |
| `disconnected`, `reconnecting` | Allow access to `/threads` (show reconnect banner), block `/pair` |

## Page Design

### Pairing Page (`/pair`)

Full-screen, centered card layout. Same design on mobile and desktop.

**User-visible elements:**
- Product name and tagline
- Single text input for pairing code
- Helper text explaining where to find the code (terminal output of `pnpm dev:bridge`)
- Submit button ("Connect")
- Inline error messages for invalid code or unreachable bridge

**Auto-detected fields (not shown to user):**
- `device.label` — derived from `navigator.userAgent` (e.g. "iPhone Safari", "Chrome macOS")
- `device.platform` — derived from `navigator.userAgent` (e.g. "ios-safari", "macos-chrome")
- `device.deviceId` — `crypto.randomUUID()`

**States:**

| State | UI |
|-------|----|
| Initial | Input + button + helper text |
| Submitting | Button loading spinner + "Connecting..." |
| Success | Auto-redirect to `/threads` |
| Invalid code | Red text below input: "Pairing code is invalid or expired" |
| Network error | Red text below input: "Cannot reach bridge. Make sure `pnpm dev:bridge` is running." |
| Bridge unreachable on load | Info banner: "Bridge not detected. Start the bridge first." |

### Main Workspace (`/threads`)

**Mobile layout** — full-screen panel switching:

- Default view: `thread-list`
- On thread tap: switch to `thread-detail` (full screen, with back button)
- State machine: `thread-list ↔ thread-detail`

**Desktop layout** — side-by-side panels:

- Left panel: thread list (about 280px)
- Right panel: thread detail

**Thread list panel:**
- Status filter tabs: `[All] [Active] [Pending] [Idle]`
- Workspace groups (collapsible)
- Thread cards showing: title, last message preview, model badge, status badge, pending request count
- Floating action button: new thread (`+`)

**Thread detail panel:**
- Header: thread title, workspace name, status, action menu (copy ID, interrupt)
- Message stream: user/assistant messages, code blocks, terminal output (reuses existing components)
- Pending requests remain visible within thread detail without leaving the page.
  The current implementation renders them above the message stream.
- Input bar: fixed at bottom, message text input + send button

### Header

Replaces the current sidebar and bottom tab bar.

| Element | Mobile | Desktop |
|---------|--------|---------|
| Left | App name "Codex" | App name "Codex" |
| Center | — | Search input |
| Right | Bell icon + Settings icon | Bell icon + Settings icon + Connection indicator |

- **Bell icon**: shows badge with total pending request count across all threads
- **Settings icon**: opens settings sheet
- **Connection indicator** (desktop only): dot + label ("Connected" / "Reconnecting...")

### Global Request Panel

Triggered by the bell icon in the header.

- Mobile: full-screen bottom sheet
- Desktop: bottom sheet in the current implementation

Shows all pending requests grouped by thread. Each request card includes:
- Thread name (clickable to navigate)
- Request type icon and description
- Action buttons (approve/deny for commands and file changes; input field for user-input prompts)

Replaces the separate `/inbox` page.

### Settings Sheet

Triggered by the settings icon in the header.

- Mobile: full-screen bottom sheet
- Desktop: right-side drawer

**Sections:**
- Connection status: state dot, mode label, bridge URL, reconnect button
- Trusted devices: list with revoke buttons (only visible if authenticated)
- About: version number

**Removed from current Connection page:**
- Runtime snapshot panel
- Manual health check button
- Pairing form (moved to `/pair`)
- "Regenerate draft device" button
- "Clear local credentials" button
- Pairing status alerts

## Component Architecture

### New components

| Component | Location | Purpose |
|-----------|----------|---------|
| `PairingScreen` | `components/pairing/` | Full-screen pairing page |
| `AuthGuard` | `app/layouts/` | Root layout that redirects based on auth state |
| `Header` | `components/layout/` | Global top navigation bar |
| `ConnectionIndicator` | `components/layout/` | Connection state dot + label |
| `NotificationBell` | `components/layout/` | Bell icon with request count badge |
| `ThreadCard` | `features/threads/components/` | Single thread item in list |
| `ThreadStatusTabs` | `features/threads/components/` | Status filter tab bar |
| `WorkspaceGroup` | `features/threads/components/` | Collapsible workspace section |
| `ThreadDetailHeader` | `features/threads/components/` | Detail panel top bar |
| `ThreadDetailMessages` | `features/threads/components/` | Conversation message list and item renderers |
| `ThreadComposer` | `features/threads/components/` | Bottom composer and settings controls |
| `RequestSheet` | `features/requests/components/` | Global request panel (replaces Inbox) |
| `PendingRequestList` | `features/requests/components/` | Request list used in thread detail and request sheet |
| `PendingRequestCard` | `features/requests/components/` | Shared request card shell |
| `SettingsSheet` | `components/settings/` | Settings panel container |
| `ConnectionSection` | `components/settings/` | Connection status in settings |
| `DevicesSection` | `components/settings/` | Trusted device list in settings |
| `device-info` | `components/pairing/` | UA detection utility |

### Removed components

| Component | Reason |
|-----------|--------|
| Current `app-shell.tsx` sidebar | Replaced by Header |
| Current `app-shell.tsx` bottom tab bar | Replaced by Header icons |
| `inbox-panel.tsx` | Replaced by `RequestSheet` + inline cards |
| `connection-route.tsx` | Split into `PairingScreen` + `SettingsSheet` |

### Refactored components

| Component | Change |
|-----------|--------|
| `app-shell.tsx` | Rewrite: Header + content area, no sidebar, no bottom nav |
| `threads-shell.tsx` → `threads-layout.tsx` | Simplify: dual-panel / single-panel adaptive layout |
| `thread-list-panel.tsx` | Split into smaller components |
| `thread-detail-panel.tsx` | Split into smaller components |

### File structure

```text
apps/client/src/
├── app/
│   ├── layouts/
│   │   ├── app-shell.tsx
│   │   ├── auth-guard.tsx
│   │   └── threads-layout.tsx
│   ├── providers.tsx
│   └── router.tsx
├── components/
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── connection-indicator.tsx
│   │   └── notification-bell.tsx
│   ├── pairing/
│   │   ├── pairing-screen.tsx
│   │   └── device-info.ts
│   ├── settings/
│   │   ├── settings-sheet.tsx
│   │   ├── connection-section.tsx
│   │   └── devices-section.tsx
│   ├── common/
│   │   ├── code-block.tsx
│   │   ├── markdown-content.tsx
│   │   └── terminal-output.tsx
│   └── ui/
├── features/
│   ├── requests/
│   │   └── components/
│   │       ├── request-sheet.tsx
│   │       ├── pending-request-list.tsx
│   │       ├── pending-request-card.tsx
│   │       ├── pending-request-body.tsx
│   │       └── pending-request-actions.tsx
│   └── threads/
│       ├── components/
│       │   ├── thread-list-panel.tsx
│       │   ├── thread-card.tsx
│       │   ├── thread-status-tabs.tsx
│       │   ├── workspace-group.tsx
│       │   ├── thread-detail-panel.tsx
│       │   ├── thread-detail-header.tsx
│       │   ├── thread-detail-messages.tsx
│       │   ├── thread-detail-composer.tsx
│       │   ├── workspace-browser-sheet.tsx
│       │   └── use-workspace-browser.ts
│       └── lib/
├── hooks/
│   ├── use-media-query.ts
│   └── use-mobile-panel.ts
├── lib/
└── index.css
```

## Design Decisions

### Why mobile-first instead of desktop-first?

The product's core scenario is "use your phone to monitor and interact with Codex running on your computer." Desktop browser is a secondary access method. Designing mobile-first ensures the primary use case gets the best experience; desktop gets a natural extension.

### Why pairing as a separate page instead of a modal?

Pairing is a prerequisite, not an optional action. A full-screen page makes this clear and prevents users from seeing an empty or broken workspace before they are connected. Paseo uses the same pattern with their Welcome Screen.

### Why merge Inbox into the workspace instead of keeping it separate?

Pending requests are always associated with a thread. Showing them inline in the thread detail and via a header bell icon keeps the user in context. The separate Inbox page forces a context switch that provides no benefit.

### Why auto-detect device info instead of letting users fill it in?

The current four-field form (code, label, platform, device ID) is confusing for non-technical users. The pairing code is the only value the user actually knows; the rest can be reliably derived from the browser's user agent.

### Why remove the runtime snapshot from the UI?

The runtime snapshot shows internal SDK state (connection kind, thread list state, detail state, selected thread ID, pending response IDs, last sync timestamp). This is debugging information for developers of this client, not useful for end users of the product.

## Acceptance Criteria

1. Unauthenticated users are automatically redirected to `/pair` and cannot access `/threads`.
2. Authenticated users are automatically redirected away from `/pair` to `/threads`.
3. Pairing requires only the pairing code as user input. Device label, platform, and device ID are auto-generated.
4. The pairing page shows clear error messages for invalid codes and unreachable bridges.
5. The main workspace renders a thread list panel with status filter tabs and workspace grouping.
6. Selecting a thread shows its detail (messages, code blocks, terminal output) with inline pending request cards.
7. The header bell icon shows the correct pending request count and opens a panel where requests can be approved/denied.
8. The settings sheet shows connection status and trusted devices with revoke functionality.
9. No runtime snapshots, health check buttons, or raw protocol details appear in user-facing UI.
10. Mobile layout uses full-screen panel switching (thread-list ↔ thread-detail) with no bottom tab bar.
11. Desktop layout shows thread list and thread detail side by side with no sidebar.
12. All existing thread interaction features work: send messages, start threads, interrupt turns, respond to requests.
13. The app builds and type-checks without errors.
14. Existing connection, pairing, and device trust behaviors are preserved at the SDK and bridge level.

## Risks

| Risk | Mitigation |
|------|------------|
| Auth state edge cases during token refresh or reconnect | Treat `refreshing` and `resyncing` as authenticated states; treat `disconnected` and `reconnecting` as authenticated-but-disrupted to avoid booting users to pairing mid-session |
| UA detection producing unexpected device labels | Use conservative defaults; device label is informational only and does not affect functionality |
| Component split breaking existing thread detail rendering | Message stream, code blocks, and terminal output components are reused without modification |
| Mobile panel state machine losing thread selection on back navigation | State machine clears `selectedThreadId` on back; URL-based routing preserves deep links on desktop |
