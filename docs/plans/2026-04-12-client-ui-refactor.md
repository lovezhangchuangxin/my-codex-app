# Client UI Refactor Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-12-client-ui-refactor.md`

Based on the approved proposal:

- `docs/proposals/2026-04-12-client-ui-refactor.md`

It also stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`

## Historical Status

This plan remains the historical implementation plan for the mobile-first UI
rewrite, but detailed file ownership and component extraction were later
refined by:

- `docs/specs/2026-04-13-client-modular-refactor.md`
- `docs/plans/2026-04-13-client-modular-refactor.md`

Current implementation rule:

- thread and request business UI lives under `features/*`
- older `components/threads/*` and `components/requests/*` references below
  should be read as historical unless explicitly updated

## Implementation Strategy

This is an in-place refactor of `apps/client/src/`. The bridge, SDK, and protocol packages are not modified. The work replaces the current routing, layout, and page components while preserving the existing runtime provider, bridge client, and feature logic.

The refactor is ordered so that each phase produces a buildable, type-checking state. No phase should leave the app in a broken intermediate state.

## Phase 1: Auth Gate + Pairing Page

**Goal:** Users who are not authenticated see a pairing screen and cannot reach the workspace.

### 1.1 Create `device-info.ts`

New file: `components/pairing/device-info.ts`

```
detectDeviceInfo() → { label: string, platform: string, deviceId: string }
```

- Parse `navigator.userAgent` to determine OS and browser.
- Produce a human-readable label (e.g. "iPhone Safari", "Chrome macOS").
- Produce a platform string (e.g. "ios-safari", "macos-chrome").
- Generate a random UUID for `deviceId`.
- Conservative defaults for unknown UA patterns.

### 1.2 Create `PairingScreen`

New file: `components/pairing/pairing-screen.tsx`

Full-screen centered card. Reuses `Input`, `Button`, and `Label` from shadcn.

**Behavior:**
- On mount, ping `bridgeHealthUrl` to check bridge availability. Show info message if unreachable.
- User enters pairing code. On submit:
  1. Call `bridgeClient.completePairing({ code, device: detectDeviceInfo() })`.
  2. On success: call `runtime.bootstrap()` then navigate to `/threads`.
  3. On failure: show inline error message.
- No device label / platform / device ID fields exposed to the user.
- Loading state on the submit button during pairing.

### 1.3 Create `AuthGuard`

New file: `app/layouts/auth-guard.tsx`

A wrapper component used in the router to protect authenticated routes.

```typescript
function AuthGuard({ children }) {
  const snapshot = useRuntimeSnapshot();
  const nav = useNavigate();
  const location = useLocation();

  const isAuthenticated = ["authenticated", "refreshing", "resyncing", "disconnected", "reconnecting"].includes(snapshot.connection.kind);

  useEffect(() => {
    if (!isAuthenticated && !location.pathname.startsWith("/pair")) {
      nav("/pair", { replace: true });
    }
    if (isAuthenticated && location.pathname.startsWith("/pair")) {
      nav("/threads", { replace: true });
    }
  }, [isAuthenticated, location.pathname]);

  return children;
}
```

### 1.4 Update `router.tsx`

```typescript
const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/threads" replace /> },
      { path: "pair", element: <PairingScreen /> },
      {
        path: "threads",
        element: <AuthGuard><ThreadsLayout /></AuthGuard>,
        children: [
          { index: true, element: <ThreadListPanel /> },
          { path: ":threadId", element: <ThreadDetailPanel /> }
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);
```

### 1.5 Verify

- `pnpm typecheck` passes
- Opening the app without credentials redirects to `/pair`
- Entering a valid pairing code navigates to `/threads`
- Entering an invalid code shows an error, stays on `/pair`

---

## Phase 2: Header + App Shell Rewrite

**Goal:** Replace the sidebar and bottom tab bar with a global Header.

### 2.1 Create `Header`

New file: `components/layout/header.tsx`

```
┌──────────────────────────────────────────────────┐
│ Mobile:  Codex                      🔔3  ⚙️    │
│ Desktop: Codex  [Search...]   🔔3  ⚙️  ● Online │
└──────────────────────────────────────────────────┘
```

- Fixed top bar: `h-14` (56px mobile) / `h-[60px]` (desktop)
- Left: "Codex" text, bold, `font-heading`
- Center (desktop only): search input (wired later, can be placeholder for now)
- Right: `NotificationBell`, settings button (opens SettingsSheet), `ConnectionIndicator` (desktop only)
- Background: `bg-card` with bottom border `border-b border-white/6`
- `z-30` to stay above content

### 2.2 Create `ConnectionIndicator`

New file: `components/layout/connection-indicator.tsx`

- Reads `snapshot.connection.kind` from `useRuntimeSnapshot()`.
- Renders a small colored dot + short label.
- States: "Connected" (green), "Reconnecting..." (yellow), "Disconnected" (red).
- Desktop only (`hidden lg:flex`).

### 2.3 Create `NotificationBell`

New file: `components/layout/notification-bell.tsx`

- `Bell` icon from lucide-react.
- Badge showing total pending request count (computed from runtime snapshot or threads).
- On click: toggle the `RequestSheet` (Phase 4). For now, just the icon + badge.
- Badge hidden when count is 0.

### 2.4 Rewrite `app-shell.tsx`

Remove:
- The entire `<aside>` sidebar (lines ~38–116 of current file)
- The entire bottom `<nav>` tab bar (lines ~125–147)
- The `navigationItems` array
- The `PageHeader` brand block

New structure:
```tsx
function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-0 lg:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
```

No padding changes for mobile (content goes full width). Desktop content area gets `px-6 py-4`.

### 2.5 Verify

- `pnpm typecheck` passes
- Header renders with Codex text, bell icon, settings icon
- No sidebar, no bottom tab bar
- All routes still accessible via URL navigation

---

## Phase 3: Threads Layout Refactor

**Goal:** Implement mobile-first thread list and thread detail with the panel state machine.

### 3.1 Create `useMobilePanel`

New file: `hooks/use-mobile-panel.ts`

```typescript
type MobilePanelView = "thread-list" | "thread-detail";

function useMobilePanel() {
  const [view, setView] = useState<MobilePanelView>("thread-list");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const openThread = (id: string) => {
    setSelectedThreadId(id);
    setView("thread-detail");
  };

  const backToList = () => {
    setView("thread-list");
    setSelectedThreadId(null);
  };

  return { view, selectedThreadId, openThread, backToList };
}
```

### 3.2 Rewrite `threads-layout.tsx`

New file: `app/layouts/threads-layout.tsx` (replaces `threads-shell.tsx`)

**Mobile** (< `lg` breakpoint):
- Uses `useMobilePanel` state machine.
- `thread-list` view: full-width `ThreadListPanel`, click thread calls `openThread(id)`.
- `thread-detail` view: full-width `ThreadDetailPanel` with back button calling `backToList()`.
- Transition: no animation in v1, just conditional rendering.

**Desktop** (>= `lg` breakpoint):
- Side-by-side: `ThreadListPanel` (left, `w-[280px] shrink-0`) + `ThreadDetailPanel` (right, `flex-1`).
- Both always visible. Thread selection from URL param `threadId`.

### 3.3 Split `thread-list-panel.tsx`

Extract from current `features/threads/components/thread-list-panel.tsx`:

| New component | Responsibility |
|---------------|----------------|
| `features/threads/components/thread-list-panel.tsx` | Container: status tabs, workspace groups, thread cards |
| `features/threads/components/thread-status-tabs.tsx` | Tab bar: `[All] [Active] [Pending] [Idle]` — replaces the current search + dropdown filter |
| `features/threads/components/thread-card.tsx` | Single thread row: title, preview, model badge, status badge, pending count |
| `features/threads/components/workspace-group.tsx` | Collapsible section: workspace name + thread count + list of thread cards |

Filter logic: status tabs filter threads by `statusBadge` field. Workspace grouping logic moves from inline to `workspace-group.tsx`. Search moves to Header (wired later).

### 3.4 Split `thread-detail-panel.tsx`

Extract from current `features/threads/components/thread-detail-panel.tsx`:

| New component | Responsibility |
|---------------|----------------|
| `features/threads/components/thread-detail-panel.tsx` | Container shell: composes sub-components |
| `features/threads/components/thread-detail-header.tsx` | Top bar: thread title, workspace, status, action menu |
| `features/threads/components/thread-detail-messages.tsx` | Message list: user/assistant messages, code blocks, terminal output |
| `features/threads/components/thread-detail-composer.tsx` | Bottom composer: text input + send button + interrupt button |

The existing rendering logic for messages, code blocks, and terminal output is moved without modification. Only the structural wrapping changes.

### 3.5 Delete `threads-shell.tsx`

Delete `app/layouts/threads-shell.tsx`. Its responsibilities move to `threads-layout.tsx`.

### 3.6 Verify

- `pnpm typecheck` passes
- Desktop: side-by-side thread list + detail
- Mobile: full-screen thread list, tap thread → full-screen detail, back button → list
- Thread selection, message viewing, sending messages all work
- Status filter tabs work

---

## Phase 4: Request Sheet + Settings Sheet

**Goal:** Replace Inbox page and Connection page with sheet/drawer components.

### 4.1 Create Pending Request Card Shell

New file: `features/requests/components/pending-request-card.tsx`

Shared request card shell used in both the request sheet and thread-detail
request display.

Props: `request`, `onApprove`, `onDeny`, `onSubmitInput`, `showThreadName`.

Renders:
- Request type icon (⚡ command, 📄 file, ❓ user-input, 🔐 permission)
- Description / command / file path
- Thread name (if `showThreadName` is true)
- Action buttons (approve/deny for commands and file changes; text input + submit for user-input)

Reuses the request resolution logic from current `features/requests/lib/request-utils.ts` and `use-request-drafts.ts`.

### 4.2 Create `RequestSheet`

New file: `features/requests/components/request-sheet.tsx`

Container component for all pending requests.

- Mobile: `Sheet` (bottom sheet, full-screen).
- Desktop: `Sheet` from the bottom edge in the current implementation.

Shows all pending requests from the runtime snapshot, grouped by thread. Each
request is rendered by the pending-request card flow. Includes a "View thread"
link per request.

State: open/close managed by `NotificationBell` click handler (lift state to `Header` or use a simple context).

### 4.3 Create Pending Request Rendering Submodules

New files:

- `features/requests/components/pending-request-list.tsx`
- `features/requests/components/pending-request-body.tsx`
- `features/requests/components/pending-request-actions.tsx`

These modules render requests specific to the currently viewed thread and also
support the request sheet, without requiring a separate `inline-request-card`
wrapper.

### 4.4 Create `SettingsSheet`

New file: `components/settings/settings-sheet.tsx`

Container for settings sections.

- Mobile: `Sheet` (bottom sheet, full-screen).
- Desktop: `Sheet` from right side (drawer).

State: open/close managed by settings icon in `Header`.

### 4.5 Create `ConnectionSection`

New file: `components/settings/connection-section.tsx`

Shows:
- Connection state dot + label
- Bridge URL
- Reconnect button

Reads from `useRuntimeSnapshot()`. The reconnect button calls `runtime.retryConnection()`.

### 4.6 Create `DevicesSection`

New file: `components/settings/devices-section.tsx`

Shows:
- List of trusted devices from `bridgeClient.listDevices()`
- Each device: icon (phone/laptop), label, last seen timestamp, "Current" badge if applicable
- Revoke button per device

Reuses the device list logic from current `connection-route.tsx` lines ~402–467.

### 4.7 Wire `NotificationBell` to `RequestSheet`

In `Header`, manage the open/close state of the request sheet. Bell click toggles it. Badge count reads from runtime snapshot pending requests.

### 4.8 Wire settings icon to `SettingsSheet`

In `Header`, manage the open/close state of the settings sheet. Settings icon click toggles it.

### 4.9 Delete old route files

- Delete `features/requests/components/inbox-panel.tsx`
- Delete `features/connection/routes/connection-route.tsx`

Update any remaining imports.

### 4.10 Verify

- `pnpm typecheck` passes
- Bell icon shows correct pending request count
- Clicking bell opens request sheet (bottom sheet in the current implementation)
- Requests can be approved/denied from the sheet
- Settings icon opens settings sheet
- Connection status displays correctly
- Devices can be listed and revoked
- Old `/inbox` and `/connection` routes redirect to `/threads`

---

## Phase 5: Cleanup + Final Verification

**Goal:** Remove dead code, verify everything works end-to-end.

### 5.1 Remove dead code

- Delete `app/layouts/threads-shell.tsx` (if not already deleted)
- Delete `features/requests/components/inbox-panel.tsx` (if not already deleted)
- Delete `features/connection/routes/connection-route.tsx` (if not already deleted)
- Remove unused imports across all touched files
- Remove the `LegacyEntryRedirect` component from router if it still exists

### 5.2 Verify search (if implemented)

If the Header search input is wired in Phase 3 or 4, verify it filters threads by title and preview content.

### 5.3 Full verification

- `pnpm typecheck` — zero errors
- `pnpm build` — succeeds
- Manual walkthrough on mobile viewport (Chrome DevTools responsive mode):
  1. Clear local credentials → refresh → redirected to `/pair`
  2. Enter pairing code → redirected to `/threads`
  3. See thread list with status tabs and workspace groups
  4. Tap a thread → full-screen detail with messages
  5. See pending requests in thread detail → approve/deny
  6. Tap bell → see all pending requests
  7. Tap settings → see connection status and devices
  8. Tap back → return to thread list
- Manual walkthrough on desktop viewport:
  1. Side-by-side thread list + detail
  2. Bell request sheet opens and works
  3. Settings drawer opens and works
  4. Connection indicator shows correct state

### 5.4 Update docs

- Update `docs/specs/2026-04-10-client-frontend-rebuild.md` historical status to note this refactor supersedes its UI sections.
- No changes needed to platform spec (`2026-04-10-codex-mobile-web-platform.md`) or auth spec (`2026-04-11-local-pairing-device-trust-session-auth.md`).

---

## Task Summary

| # | Phase | Key Files | Depends On |
|---|-------|-----------|------------|
| 1 | Auth gate + pairing | `device-info.ts`, `pairing-screen.tsx`, `auth-guard.tsx`, `router.tsx` | — |
| 2 | Header + app shell | `header.tsx`, `connection-indicator.tsx`, `notification-bell.tsx`, `app-shell.tsx` | Phase 1 |
| 3 | Threads layout | `threads-layout.tsx`, `use-mobile-panel.ts`, split thread components | Phase 2 |
| 4 | Request + settings sheets | `request-sheet.tsx`, `pending-request-list.tsx`, `pending-request-card.tsx`, `settings-sheet.tsx`, `connection-section.tsx`, `devices-section.tsx` | Phase 3 |
| 5 | Cleanup + verification | Remove old files, update docs | Phase 4 |

## Implementation Approach

This refactor has high coupling (routing, layout, and components all change together) and sequential dependencies between phases. The recommended approach is **main agent execution** — implement phase by phase, verify each phase builds and type-checks before proceeding.

If the user prefers parallel execution, Phases 1 and 2 could be done concurrently since they touch different files, but Phase 3 depends on Phase 2's Header, and Phase 4 depends on Phase 3's layout.
