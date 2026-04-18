# Realtime Session List Technical Plan

## Relationship To Specs

This plan implements:

- `docs/specs/2026-04-18-realtime-session-list.md`

It builds on patterns established in:

- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- bridge subscription, SDK state, and client rendering are tightly coupled
- the task is about adding a parallel event channel, not independent UI slices
- correctness depends on understanding the full event lifecycle

## Design Summary

Add a "global" SSE subscription mode alongside the existing per-thread mode.
Events reach global clients from two sources:

1. **Per-thread subscriptions**: when a mobile user opens a thread detail view,
   `resumeThread()` subscribes to that thread. Events from the bridge's app-server
   flow to both per-thread and global SSE clients via `broadcast()`.
2. **ThreadChangeDetector**: watches the filesystem for external thread changes
   (TUI, CLI) and synthesizes events. See
   `docs/plans/2026-04-18-external-thread-change-detection.md`.

The SDK connects to the global channel during bootstrap and feeds events into the
existing `updateThreadSummaryState()` reducer. The client derives project sessions
from the now-real-time `runtimeThreadsState` instead of a separate HTTP fetch.

Core decisions:

- global SSE clients do not trigger `resumeThread` / `unsubscribeThread` — events
  reach global clients through existing per-thread subscriptions and the
  ThreadChangeDetector
- no bulk subscription of all threads (`subscribeAllThreadsForGlobal` was considered
  but rejected — expensive and still misses TUI events due to separate app-server
  instances)
- the global SSE channel runs in parallel with per-thread SSE; duplicate events are
  safe because the reducer is idempotent
- `sessionsState` is derived via `useMemo` from `runtimeThreadsState` filtered by
  project path, replacing the separate HTTP fetch and 120ms debounce mechanism

## Module Changes

### `apps/bridge/src/server/threadEventStreamRegistry.ts`

Add global client support:

- New type `GlobalEventClient = { response: ServerResponse }`
- New field `#globalEventClients: Set<GlobalEventClient>`
- Modify `broadcast()`: after existing per-thread loop, check `isGlobalChannelEvent(event)`
  and forward to all global clients
- Add `isGlobalChannelEvent(event)` function with the allowlist from the spec.
  For `itemStarted`/`itemCompleted`, additionally check `event.item.type === 'userMessage'`
  at the bridge layer to avoid forwarding non-userMessage item events.
- Add `addGlobalClient(response)` / `removeGlobalClient(client)` methods
  - No `resumeThread` / `unsubscribeThread` — global clients are passive receivers
- Update `close()`: iterate and end all global clients

The ThreadChangeDetector (see external-thread-change-detection plan) integrates into
`addGlobalClient` / `removeGlobalClient` for filesystem-based event synthesis.

### `apps/bridge/src/server/bridgeServer.ts`

Modify `#handleEventRoute()` (~L681):

- Remove the 400 response when `threadId` is missing
- When `threadId` is absent: call `eventRegistry.addGlobalClient(response)`,
  attach `request.on('close', ...)` cleanup
- When `threadId` is present: existing per-thread behavior unchanged

### `packages/sdk/src/bridgeClient.ts`

Add global event subscription:

- New method `subscribeToGlobalEvents(handlers)` — same signature pattern as
  `subscribeToThreadEvents` but no `threadId` parameter
- SSE URL: `/api/events?access_token=...` (no threadId)
- Extract shared SSE connection logic from `subscribeToThreadEvents` into a
  private `#createEventSource(url, handlers)` method to avoid duplication

### `packages/sdk/src/threadRuntime.ts`

Connect global SSE during bootstrap:

- New field `#unsubscribeGlobalEvents: (() => void) | null`
- New method `#connectGlobalEvents()`:
  - Calls `client.subscribeToGlobalEvents()`
  - `onEvent`: feeds events into `updateThreadSummaryState()`, updating
    `runtimeThreadsState` for all threads
  - `onDisconnect`: always calls `#scheduleReconnect()` when the connection
    is `authenticated`, regardless of per-thread SSE state. This ensures the
    session list stays real-time even while viewing a thread detail.
    Note: `#unsubscribeGlobalEvents` is NOT set to null in `onDisconnect` to
    avoid a race condition with concurrent `#disconnectEvents()` calls;
    `#disconnectGlobalEvents()` handles cleanup safely.
- New method `#disconnectGlobalEvents()`
- Call `#connectGlobalEvents()` in `#performResync()` success path, before
  `this.#markAuthenticated()`
- Call `#connectGlobalEvents()` after `#showSelectedThread()` in `startThread()`
  to maintain the global channel when creating a new thread
- Call `#disconnectGlobalEvents()` in `dispose()`, `resetState()`, and
  `#applySessionLoss()`

### `apps/client/src/features/projects/hooks/use-project-home.ts`

Derive sessions from runtime state:

- Add `useMemo` to the React import (`import { useEffect, useMemo, useState }`)
- Remove `sessionsState` local state and its HTTP fetch effect (the second `useEffect`)
- Remove `sessionsReloadToken`
- Remove the 120ms debounce effect (the third `useEffect`)
- Derive `sessionsState` via `useMemo`:
  ```ts
  const sessionsState = useMemo(() => {
    if (!selectedProjectPath) return { kind: 'idle' };
    if (!canQueryBridge(connectionKind)) {
      // Preserve last-known ready state during transient connection loss.
      if (runtimeThreadsState.kind === 'ready')
        return {
          kind: 'ready',
          threads: runtimeThreadsState.threads.filter(
            (t) => t.cwd === selectedProjectPath,
          ),
        };
      return { kind: 'idle' };
    }
    if (runtimeThreadsState.kind === 'loading') return { kind: 'loading' };
    if (runtimeThreadsState.kind === 'error')
      return { kind: 'error', message: runtimeThreadsState.message };
    if (runtimeThreadsState.kind === 'ready')
      return {
        kind: 'ready',
        threads: runtimeThreadsState.threads.filter(
          (t) => t.cwd === selectedProjectPath,
        ),
      };
    return { kind: 'idle' };
  }, [connectionKind, selectedProjectPath, runtimeThreadsState]);
  ```
- Keep `refreshProjects()` and project-list logic unchanged
- Update `importProject()`: remove `refreshSessions()` call inside it. The newly
  created thread will appear in `runtimeThreadsState` via the global SSE `threadStarted`
  event, and the useMemo will automatically reflect it in `sessionsState`. Keep only
  `refreshProjects()` to update the project list.
- Remove `refreshSessions()` method (no longer needed — sessions are derived)

## Task Breakdown

1. **threadEventStreamRegistry.ts** — add global client type, filtered broadcast,
   add/remove methods
2. **bridgeServer.ts** — allow no-threadId SSE, route to global client path
3. **bridgeClient.ts** — add `subscribeToGlobalEvents()`, extract shared SSE helper
4. **threadRuntime.ts** — connect global SSE in bootstrap, lifecycle management
5. **use-project-home.ts** — derive sessionsState from runtimeThreadsState

Tasks 1–3 are independent and can be developed in parallel. Task 4 depends on 3.
Task 5 depends on 4.

## Verification

1. **Type check**: `pnpm typecheck`
2. **Bridge tests**: `pnpm --filter @my-codex-app/bridge test`
3. **Unit tests**:
   - `isGlobalChannelEvent`: test each allowlisted event type passes, each excluded
     type is rejected, and `itemStarted`/`itemCompleted` with non-userMessage items
     are rejected.
   - `ThreadEventStreamRegistry`: test global client add/remove/broadcast. Verify
     global clients receive allowlisted events but not heavy events like
     `agentMessageDelta`. Verify global clients do not affect per-thread subscriber
     counts or unsubscribe timers.
   - SDK `subscribeToGlobalEvents`: mock EventSource, verify it connects to
     `/api/events` without `threadId`, verify event delivery and disconnect handling.
   - `BridgeThreadRuntime` integration: bootstrap with mocked global SSE, simulate
     `threadStatusChanged` event, verify `snapshot.threads` updates without selecting
     any thread.
4. **Manual scenario**:
   - Mobile: open project session list, no thread selected
   - Desktop Codex TUI: send a message in a thread under the same project
   - Verify: mobile session list shows "活跃" in real-time
   - Wait for turn to complete
   - Verify: status reverts to "空闲" in real-time
5. **Regression**: open thread detail view, verify per-thread SSE (streaming text,
   reasoning, command output) still works
6. **Format**: `pnpm fmt`
