# Realtime Session List Spec

## Relationship To Existing Specs

This spec extends:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`

It addresses a gap in the reconnect/resync milestone:

- the project session list does not receive real-time thread status updates when no
  thread is selected

## Background

The project session list page (mobile: after tapping a project card) displays all
threads for a project with status tabs: 全部 / 活跃 / 等待审批 / 等待输入 / 空闲.

Currently `sessionsState` is populated by a one-time HTTP fetch (`GET /api/threads?cwd=...`)
and only refreshes when `runtimeThreadsState` changes (via 120ms debounce). But
`runtimeThreadsState` only receives real-time SSE events for the **currently selected**
thread. When no thread is selected — the typical mobile scenario while browsing the
session list — status changes from other clients or from Codex TUI activity are invisible
until the user navigates away and back.

The bridge receives thread events from its own `codex app-server` child process
(via stdio JSON-RPC) — but only for threads that have been explicitly subscribed
via `resumeThread`. Events from external processes (Codex TUI, CLI) are invisible
because each process runs an independent app-server instance. See
`docs/reference/2026-04-18-codex-app-server-internals.md` for details.

The gap this spec addresses is the SSE delivery layer, which currently filters by
`threadId`. External thread change detection is covered by a companion spec:
`docs/specs/2026-04-18-external-thread-change-detection.md`.

## Goals

- Make the project session list update in real-time when any thread changes status,
  even when no thread is selected.
- Reuse the existing event pipeline: bridge already translates and broadcasts all
  app-server events; we only need a second delivery channel.
- Keep per-thread SSE (detail view) unchanged.
- Keep the global channel lightweight — no deltas, reasoning text, or detail-only
  events.
- Derive the session list from the already-maintained `runtimeThreadsState` instead
  of a separate HTTP fetch.

## Non-Goals

- Relay-mode event streaming.
- Push notifications or background wake-up.
- Changing the codex app-server notification protocol.
- Streaming heavy per-thread detail events (deltas, reasoning) on the global channel.

## Scope

Included:

- bridge: global SSE subscription mode (alongside existing per-thread mode)
- bridge: lightweight event filtering for the global channel
- SDK: global event subscription method
- SDK: feeding global events into the existing `runtimeThreadsState` reducer
- client: deriving project sessions from `runtimeThreadsState` instead of HTTP fetch
- connection lifecycle: bootstrap, reconnect, auth loss, dispose

Deferred:

- relay-mode global event forwarding
- mobile push notifications
- background thread activity polling

## Data Flow

Current:

```
app-server ─stdio─▶ AppServerClient ─translate─▶ ThreadService
  ─▶ ThreadEventStreamRegistry.broadcast(event)
    ─▶ SSE to clients where client.threadId === event.threadId only
```

Proposed (adds global channel, two event sources):

```
Source 1 — Bridge's own app-server (per-thread subscriptions):
  app-server ─stdio─▶ ThreadService
    ─▶ ThreadEventStreamRegistry.broadcast(event)
      ─▶ per-thread clients: all events (unchanged)
      ─▶ global clients: summary events only (NEW)

Source 2 — External processes (TUI, CLI), via filesystem detection:
  codexHome/sessions/ ─chokidar─▶ ThreadChangeDetector
    ─▶ ThreadEventStreamRegistry.broadcast(syntheticEvent)
      ─▶ global clients: summary events only
  (See docs/specs/2026-04-18-external-thread-change-detection.md)
```

Client side:

```
BridgeThreadRuntime
  ─▶ #connectGlobalEvents() ─SSE /api/events (no threadId)─▶
    updateThreadSummaryState() ─▶ runtimeThreadsState (real-time for ALL threads)

useProjectHome
  ─▶ sessionsState = useMemo(filterByProject(runtimeThreadsState))
    (no more separate HTTP fetch)
```

## Global Channel Event Allowlist

Only these events are forwarded to global SSE clients:

| Event                                | Rationale                                                              |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `threadStarted`                      | New thread appears in list                                             |
| `threadStatusChanged`                | Status tab filtering (core)                                            |
| `threadNameUpdated`                  | Thread name display                                                    |
| `threadDeleted`                      | Thread removed from list                                               |
| `pendingRequestAdded`                | Badge / tab count                                                      |
| `pendingRequestResolved`             | Badge / tab count                                                      |
| `turnStarted`                        | Thread becomes active                                                  |
| `turnCompleted`                      | Turn finished; primarily for client-side message queue drain semantics |
| `turnError`                          | Turn failed (non-retry); same queue-drain reason as above              |
| `itemStarted` (`userMessage` only)   | Preview text update                                                    |
| `itemCompleted` (`userMessage` only) | Preview text update                                                    |

Excluded (detail-only, high frequency, or no list impact):

- `agentMessageDelta` — streaming text
- `reasoningSummaryPartAdded` / `reasoningSummaryTextDelta` / `reasoningTextDelta`
- `threadSettingsUpdated` / `threadContextUsageUpdated`

## Connection Lifecycle

The global SSE channel runs in parallel with the per-thread SSE channel. Their
lifecycle is managed independently:

| Event                        | Action                                                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap with credentials   | `#performResync('startup')` → fetch thread list → `#connectGlobalEvents()` → `#markAuthenticated()`                                                                                                                                                                   |
| Select a thread              | `#connectEvents(threadId)` — global SSE continues running                                                                                                                                                                                                             |
| Deselect a thread            | `#disconnectEvents()` — global SSE keeps running, list stays real-time                                                                                                                                                                                                |
| Global SSE disconnects       | Non-fatal. `#scheduleReconnect()` triggers a full `#performResync()` which re-fetches the thread list and calls `#connectGlobalEvents()` again. Reconnect is always attempted when the connection is `authenticated`, regardless of whether per-thread SSE is active. |
| Per-thread SSE disconnects   | Existing reconnect logic unchanged. Global SSE still provides summary updates for all threads.                                                                                                                                                                        |
| Auth loss / session invalid  | Both channels disconnected by `#applySessionLoss()` → `#disconnectGlobalEvents()`.                                                                                                                                                                                    |
| `dispose()` / `resetState()` | Both channels disconnected.                                                                                                                                                                                                                                           |

## Error Handling And Degradation

- **Global SSE disconnects**: non-fatal. `#scheduleReconnect()` always triggers when
  the connection is `authenticated`, regardless of per-thread SSE state. Between
  disconnect and reconnect, the session list shows the last-known state — no worse
  than the previous HTTP-snapshot behavior.
- **Duplicate events**: when a thread is selected, summary events arrive from both
  the per-thread and global SSE channels. `updateThreadSummaryState()` is idempotent —
  consecutive `#update()` calls from two EventSource callbacks produce the same result.
  The extra re-render is acceptable overhead.
- **Bridge not supporting global SSE**: client falls back gracefully. If the global
  SSE connection returns an error (e.g., older bridge version), `#connectGlobalEvents()`
  disconnects cleanly and the session list reverts to initial-load-only behavior until
  the next `resyncFromBridge()`.
- **Auth loss**: both SSE channels are disconnected by `#applySessionLoss()`.

## Acceptance Criteria

1. Mobile user on the project session list page sees a thread become "活跃" in
   real-time when another client sends a message in that thread.
2. Thread reverts to "空闲" in real-time when the turn completes.
3. "等待审批" and "等待输入" tabs update in real-time.
4. New threads appear in the list in real-time when created by another client.
5. Per-thread SSE (thread detail view) continues to work unchanged.
6. Selecting a thread and returning to the list preserves real-time updates.
7. `pnpm typecheck` and `pnpm --filter @my-codex-app/bridge test` pass.
