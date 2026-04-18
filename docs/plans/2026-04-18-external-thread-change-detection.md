# External Thread Change Detection Technical Plan

## Relationship To Specs

This plan implements:

- `docs/specs/2026-04-18-external-thread-change-detection.md`

It builds on patterns and code from:

- `docs/specs/2026-04-18-realtime-session-list.md` — global SSE channel, event
  allowlist
- `docs/reference/2026-04-18-codex-app-server-internals.md` — app-server
  architecture context

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- the change spans protocol types, a new bridge module, and SDK reducer changes
- correctness depends on understanding the bridge's event pipeline and lifecycle

## Design Summary

Add a `ThreadChangeDetector` class that watches the Codex sessions directory
using `chokidar`. When rollout files change, it debounces, calls `listThreads`
to fetch the latest state from the app-server (which scans the filesystem),
diffs against a cached snapshot of full `ThreadSummary` objects, and synthesizes
`BridgeEvent` objects for changed/new/deleted threads. These events are forwarded
through the existing `ThreadEventStreamRegistry.broadcast()` method to global
SSE clients.

The detector's lifecycle is tied to global SSE client presence: started when the
first global client connects, stopped when the last disconnects. On start, the
cache is initialized from `listThreads()` without emitting events, preventing
spurious "new thread" notifications for existing threads.

This replaces the previous approach of subscribing to all threads via
`resumeThread` (expensive, and still misses TUI events due to separate
app-server instances).

Protocol changes (safe — no users yet):

- `threadStarted.thread` changes from `ThreadDetail` to `ThreadSummary`
- New `threadDeleted` event type

Core decisions:

- **chokidar with FSEvents** — reliable recursive watching on macOS, same
  technology used by VS Code
- **Debounce 500ms** — batches rapid rollout file writes during active turns
- **Cache full ThreadSummary** — enables synthesizing complete `threadStarted`
  events and detecting all field-level changes
- **Reuse `broadcast()`** — synthesized events flow through the same pipeline as
  real app-server events, no new SSE protocol needed
- **No bulk `resumeThread`** — detector replaces the expensive
  `subscribeAllThreadsForGlobal` approach
- **Cache initialization on start** — prevents spurious events for existing
  threads

## Protocol Changes

### `packages/protocol/src/index.ts`

1. Change `threadStarted` event to carry `ThreadSummary`:

```typescript
// Before
| { type: 'threadStarted'; threadId: string; thread: ThreadDetail }

// After
| { type: 'threadStarted'; threadId: string; thread: ThreadSummary }
```

2. Add `threadDeleted` event type:

```typescript
| { type: 'threadDeleted'; threadId: string }
```

### `packages/sdk/src/threadState.ts`

1. Update `threadStarted` handler — use `event.thread` directly instead of
   `toThreadSummary(event.thread)`:

```typescript
case 'threadStarted':
  return {
    kind: 'ready',
    threads: upsertThreadSummary(state.threads, event.thread),
  };
```

2. Add `threadDeleted` handler in `updateThreadSummaryState()`:

```typescript
case 'threadDeleted':
  if (state.kind !== 'ready') return state;
  return {
    kind: 'ready',
    threads: state.threads.filter((t) => t.id !== event.threadId),
  };
```

3. Update `applyThreadEvent()` — `threadStarted` currently returns
   `event.thread` (a `ThreadDetail`). After the protocol change, `event.thread`
   is `ThreadSummary`. Since detail view loads via `readThread()` (not SSE),
   return the current thread unchanged:

```typescript
// Before (line 237-238)
case 'threadStarted':
  return event.thread;

// After
case 'threadStarted':
  return thread;  // Detail state unchanged — detail view uses readThread()
```

4. Add `threadDeleted` handler in `applyThreadEvent()` — return current thread
   unchanged (detail view will navigate away on its own):

```typescript
case 'threadDeleted':
  return thread;  // Detail state unchanged — caller handles navigation
```

### Bridge event translation

`apps/bridge/src/threads/threadEventTranslator.ts` (line 54-65):

Change the `thread/started` case to emit `ThreadSummary` instead of
`ThreadDetail`:

```typescript
// Before
case 'thread/started': {
  const rawThread = payload.thread as AppServerThread;
  this.cache.setThreadCwd(rawThread.id, rawThread.cwd);
  const thread = attachThreadRuntime(
    this.cache,
    toThreadDetail(
      rawThread,
      this.cache.listPendingRequests(rawThread.id),
    ),
  );
  return { type: 'threadStarted', threadId: thread.id, thread };
}

// After
case 'thread/started': {
  const rawThread = payload.thread as AppServerThread;
  const pendingRequests = this.cache.listPendingRequests(rawThread.id);
  this.cache.setThreadCwd(rawThread.id, rawThread.cwd);
  const thread = toThreadSummary(rawThread, pendingRequests);
  return { type: 'threadStarted', threadId: thread.id, thread };
}
```

Note: `attachThreadRuntime()` is removed from this path — it adds runtime
fields (`settings`, `contextUsage`, `mergedCommandItems`) that only belong in
`ThreadDetail`, not `ThreadSummary`.

## Module Changes

### `apps/bridge/package.json`

Add `chokidar` dependency:

```json
"dependencies": {
  "chokidar": "^4.0.0"
}
```

### `apps/bridge/src/server/threadChangeDetector.ts` (NEW)

New class `ThreadChangeDetector`:

```typescript
import type { FSWatcher } from 'chokidar';
import { watch } from 'chokidar';
import type { BridgeEvent, ThreadSummary } from '@my-codex-app/protocol';
import type { ThreadService } from '../threadService.js';

export class ThreadChangeDetector {
  readonly #threadService: ThreadService;
  readonly #codexHome: string;
  readonly #onEvent: (event: BridgeEvent) => void;
  #watcher: FSWatcher | null = null;
  #cache = new Map<string, ThreadSummary>();
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #processing = false;
  #starting = false;
  #closing = false;
  static readonly DEBOUNCE_MS = 500;

  constructor(
    threadService: ThreadService,
    codexHome: string,
    onEvent: (event: BridgeEvent) => void,
  ) { ... }

  async start(): Promise<void> { ... }
  async close(): Promise<void> { ... }
  async #handleChange(): Promise<void> { ... }
}
```

**`start()`**:

1. Set `#starting = true`
2. Create chokidar watcher on `{codexHome}/sessions/` **first** (with
   `ignoreInitial: true`) so no changes are missed during the async gap
3. Options: `{ ignoreInitial: true, ignored: (path) => !path.endsWith('.jsonl') && !path.includes('sessions') }`
4. On `add`/`change`/`unlink` events: schedule debounced `#handleChange()`
   (skipped if `#starting`, `#closing`, or `#processing` is true)
5. Call `listThreads({})` and populate `#cache` with full `ThreadSummary`
   objects — **no events emitted** (baseline). Any file changes detected
   between step 2 and step 5 will fire after debounce, by which time the cache
   is already populated.
6. Set `#starting = false`
7. Run `#scheduleHandleChange()` to catch any changes that occurred during the
   async gap while debounce was suppressed by `#starting = true`

If the sessions directory does not exist, log a debug message and skip watcher
creation (no sessions yet).

**`close()`** (async):

1. Set `#closing = true`
2. Clear debounce timer
3. Await watcher close (if exists)
4. Clear cache

**`#handleChange()`**:

1. Check `if (#closing) return;`
2. Set `#processing = true` to prevent concurrent executions from overlapping
   debounce callbacks
3. Call `threadService.listThreads({})`
4. Check `if (#closing) return;` again (may have changed during async call)
5. Build new `Map<threadId, ThreadSummary>` from result
6. Diff against `#cache`:
   - Thread in new but not in cache → `threadStarted` event with full summary
   - Thread status changed → `threadStatusChanged` event
   - Thread name changed → `threadNameUpdated` event
   - Thread updatedAt changed but status/name same → `threadStatusChanged`
     with current status (covers preview/recency updates)
   - Thread in cache but not in new → `threadDeleted` event
7. Replace `#cache` with new map
8. Call `#onEvent(event)` for each synthesized event

Error handling: if `listThreads()` fails, log and skip. Do not disrupt the
watcher or clear the cache.

### `apps/bridge/src/server/threadEventStreamRegistry.ts`

This module is also modified by the realtime-session-list plan. Changes here
are additive to those modifications.

1. Import `ThreadChangeDetector`
2. Add field `#threadChangeDetector: ThreadChangeDetector | null = null`
3. Add field `#detectorInitPromise: Promise<ThreadChangeDetector> | null = null`
   to prevent concurrent detector creation from racing `addGlobalClient()` calls
4. Add constructor parameter `codexHome: string`
5. In `addGlobalClient()`: create and start detector when first global client
   connects, using a promise-based lock (`#detectorInitPromise`) to prevent
   concurrent detector creation. The detector's `onEvent` callback calls
   `this.broadcast(event)`. Client is added after detector initialization
   succeeds (prevents broken client state on detector start failure).
6. In `removeGlobalClient()`: close detector when last global client disconnects
7. In `close()`: close detector if exists, reset `#detectorInitPromise`
8. In `broadcast()`: collect dead clients during iteration and delete after the
   loop to avoid modifying the Set during iteration (avoids skipping clients)

**Removed**: `#subscribeAllThreadsForGlobal()` method,
`#globalSubscribedThreadIds` tracking, and related unsubscribe logic. The
detector replaces this entirely.

Thread lifecycle is simplified:

- Threads are subscribed via `resumeThread` only when per-thread SSE clients
  request it (in `addClient()`)
- Threads are unsubscribed when no per-thread clients remain (grace period)
- Global clients do not affect thread subscription lifecycle

### `apps/bridge/src/server.ts`

Pass `codexHome` to `ThreadEventStreamRegistry` constructor:

```typescript
const eventRegistry = new ThreadEventStreamRegistry(
  threadService,
  config.threadUnsubscribeGraceMs,
  initializeResult.codexHome, // new parameter
);
```

## Task Breakdown

1. **Protocol changes** — update `BridgeEvent` types in `packages/protocol`,
   update SDK reducers (`updateThreadSummaryState` and `applyThreadEvent`) in
   `packages/sdk/src/threadState.ts`
2. **package.json** — add `chokidar` dependency, run `pnpm install`
3. **threadChangeDetector.ts** — implement new module
4. **threadEventStreamRegistry.ts** — integrate detector into lifecycle, remove
   `subscribeAllThreadsForGlobal` logic
5. **server.ts** — pass `codexHome` to registry constructor
6. **threadEventTranslator.ts** — change `thread/started` case to emit
   `ThreadSummary` instead of `ThreadDetail` (see Protocol Changes section)
7. **Cleanup** — remove any diagnostic `console.log` statements added during
   development

Task 1 is independent. Task 2 is a prerequisite for 3. Task 3 is a prerequisite
for 4. Tasks 4 and 5 can be done together. Task 6 can be done in parallel with
3-5. Task 7 is final.

## Verification

1. **Type check**: `pnpm --filter @my-codex-app/bridge typecheck`
2. **Bridge tests**: `pnpm --filter @my-codex-app/bridge test`
3. **SDK tests**: verify `updateThreadSummaryState` handles `threadDeleted` and
   new `threadStarted` shape correctly
4. **Manual scenario**:
   - Start bridge: `codexb start`
   - Open mobile app, navigate to project session list
   - On desktop, run `codex` (TUI) and send a message
   - Verify: mobile session list shows "active" status within 2 seconds
   - Wait for turn to complete
   - Verify: status reverts to "idle" within 2 seconds
   - Create a new thread via TUI
   - Verify: new thread appears in mobile session list within 2 seconds
   - Delete a thread via TUI
   - Verify: thread disappears from mobile session list within 2 seconds
5. **Regression**: open thread detail view, verify per-thread SSE streaming
   (agent text, reasoning, command output) still works
6. **Format**: `pnpm fmt`
