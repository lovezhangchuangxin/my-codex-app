# Codex App-Server Internal Architecture

## Purpose

This document records deep implementation details learned from reading the Codex
source at `$CODEX_SOURCE_CODE_HOME`. It complements
`2026-04-11-codex-upstream-integration-guide.md` with internals that affect how
`my-codex-app` bridge detects and relays thread state changes.

## Key Files

| Topic                                 | File                                                 |
| ------------------------------------- | ---------------------------------------------------- |
| In-process app-server runtime         | `codex-rs/app-server/src/in_process.rs`              |
| TUI app-server adapter                | `codex-rs/tui/src/app/app_server_adapter.rs`         |
| TUI session client                    | `codex-rs/tui/src/app_server_session.rs`             |
| Transport layer (stdio / WS)          | `codex-rs/app-server/src/transport/mod.rs`           |
| Thread state + subscriber bookkeeping | `codex-rs/app-server/src/thread_state.rs`            |
| Turn execution + event dispatch       | `codex-rs/app-server/src/codex_message_processor.rs` |
| Outgoing message routing              | `codex-rs/app-server/src/outgoing_message.rs`        |
| Rollout file listing / scanning       | `codex-rs/rollout/src/list.rs`                       |
| Codex home directory resolution       | `codex-rs/utils/home-dir/src/lib.rs`                 |
| TUI entry + embedded/remote selection | `codex-rs/tui/src/lib.rs` (line ~660)                |
| App-server client facade              | `codex-rs/app-server-client/src/lib.rs`              |

## Process Architecture

### TUI (Default): Embedded In-Process App-Server

When the user runs `codex` (the CLI/TUI), the app-server runs **inside the same
process** (same PID). There is no child process spawn.

```
┌──────────────────────────────────────┐
│ codex (TUI) process                  │
│                                      │
│  TUI UI layer                        │
│      ↕ bounded MPSC channels         │
│  Embedded App-Server (in-process)    │
│                                      │
└──────────────────────────────────────┘
```

**Source**: `tui/src/lib.rs` line ~660:

```rust
let app_server_target = remote_url
    .clone()
    .map(|websocket_url| AppServerTarget::Remote { ... })
    .unwrap_or(AppServerTarget::Embedded);  // ← DEFAULT
```

Transport: in-memory `mpsc` channels (capacity 128), no stdio or network.

### Bridge: Separate Child Process via stdio

`my-codex-app` bridge spawns `codex app-server` as a **child process**:

```ts
// apps/bridge/src/app-server/jsonRpcProcessClient.ts
this.#child = spawn('codex', ['app-server'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

Transport: stdio JSON-RPC over pipes.

### Critical Implication

The TUI's embedded app-server and the bridge's child-process app-server are
**two completely separate instances**. They share the same `codexHome`
filesystem but have independent in-memory state and event systems. Events
generated in one instance are NOT forwarded to the other.

## Event Broadcasting

### Multi-Connection Broadcast Within a Single Instance

The app-server **does** broadcast events to ALL subscribed connections within
the same process.

**Source**: `codex_message_processor.rs` (~line 7599):

```rust
let subscribed_connection_ids = thread_state_manager
    .subscribed_connection_ids(conversation_id)
    .await;
let thread_outgoing = ThreadScopedOutgoingMessageSender::new(
    outgoing_for_task.clone(),
    subscribed_connection_ids,  // ALL subscribed connections
    conversation_id,
);
```

- A connection subscribes to a thread via `thread/resume`
- The `ThreadStateManager` tracks `connection_ids: HashSet<ConnectionId>` per
  thread
- Turn events (`turn/started`, `item/started`, etc.) are sent to ALL subscribed
  connections

**This means**: if the TUI used `--remote` to connect to the bridge's
app-server, events WOULD flow to all connections. The issue is that the TUI
uses its own embedded instance by default.

### No Cross-Instance Event Sharing

There is **no mechanism** for events to cross process boundaries:

- No shared event log or append-only file
- No named pipes or Unix domain sockets for IPC
- No publish/subscribe system across instances
- No file locks or coordination primitives

The only shared resource is the filesystem (rollout files + SQLite database).

### Outgoing Message Routing

**Source**: `outgoing_message.rs`:

```rust
pub(crate) async fn send_server_notification_to_connections(
    &self,
    connection_ids: &[ConnectionId],
    notification: ServerNotification,
) {
    if connection_ids.is_empty() {
        // Broadcast to ALL initialized connections
        self.sender.send(OutgoingEnvelope::Broadcast { ... }).await
    } else {
        // Send to specific connections
        for connection_id in connection_ids { ... }
    }
}
```

Transport layer (`transport/mod.rs` line ~366) filters by:

- Connection must be initialized
- Connection has not opted out of the notification method

## Thread Subscription Model

### Subscription Tracking

**Source**: `thread_state.rs`:

```rust
struct ThreadEntry {
    state: Arc<Mutex<ThreadState>>,
    connection_ids: HashSet<ConnectionId>,  // All subscribed connections
}
```

Bidirectional mapping:

- `thread_ids_by_connection: HashMap<ConnectionId, HashSet<ThreadId>>` — which
  threads each connection is subscribed to
- `threads: HashMap<ThreadId, ThreadEntry>` — which connections each thread has

### `thread/resume` Behavior

1. Adds the calling connection to the thread's subscriber set
2. Returns current thread state (from memory if cached, from filesystem
   if not)
3. If the thread has an active turn, the connection starts receiving
   real-time events immediately

**Validated by test**:
`thread_resume_keeps_in_flight_turn_streaming` in
`app-server/tests/suite/v2/thread_resume.rs` — a secondary connection calling
`thread/resume` during an active turn receives all subsequent events.

## Thread Discovery and Filesystem

### Rollout File Storage

```
{codexHome}/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDThh-mm-ss-<uuid>.jsonl
```

- `codexHome` default: `~/.codex` (or `$CODEX_HOME` env var)
- Subdirectory constant: `SESSIONS_SUBDIR = "sessions"`
- Archived threads: `archived_sessions/` with the same date hierarchy
- Filename pattern: `rollout-{ISO-timestamp}-{uuid}.jsonl`

### `thread/list` Always Scans Filesystem

**Source**: `rollout/src/list.rs`

`listThreads` does **not** use an in-memory cache. It scans the filesystem
every time:

1. Walks `{codexHome}/sessions/` directory tree
2. Iterates years → months → days in descending order
3. Collects `rollout-*.jsonl` files matching the filename pattern
4. Parses timestamp and UUID from filename for sorting
5. Supports cursor-based pagination
6. Has a scan cap: `MAX_SCAN_FILES = 10000`

**Critical implication for my-codex-app**: Calling `listThreads` on the
bridge's app-server WILL return the latest state of all threads, including
threads modified by the TUI's embedded app-server. The filesystem is the
source of truth.

### No Single Watch Point

Because rollout files are distributed across date-based directories
(`YYYY/MM/DD/`), there is no single directory whose `mtime` reliably indicates
changes across all threads. Detecting filesystem changes requires recursive
watching of the entire `sessions/` directory.

## Transport Constraints

### Single Transport Per App-Server Instance

**Source**: `transport/mod.rs`:

```rust
pub enum AppServerTransport {
    Stdio,                              // ← OR
    WebSocket { bind_address: SocketAddr },  // ← OR
    Off,                                // ← One at a time
}
```

An app-server instance can only use **one** transport. It cannot listen on both
stdio and WebSocket simultaneously.

### TUI Remote Mode

```bash
codex --remote ws://127.0.0.1:4500 [--remote-auth-token-env VAR]
```

- No config file or environment variable to set default remote
- Must be specified on every invocation
- Only supported for interactive TUI commands

### No Auto-Discovery

No PID files, port files, named sockets, or discovery mechanisms. Each consumer
must know how to reach its app-server instance explicitly.

## SQLite State Database

- Location: `~/.codex/state.sqlite` (with WAL mode `-wal` and `-shm` files)
- Tables: `threads`, `logs`, `memories`, etc.
- Used for metadata, structured logging, and thread state queries
- WAL mode allows concurrent reads from other processes

## Hooks and Plugin System

### Internal Hooks Only

The hook system (`core/src/hook_runtime.rs`) supports:

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `UserPromptSubmit`

These run **within the same process**. There is no mechanism for hooks to
signal external processes.

### No External Notification System

- No webhooks
- No external event bus
- No plugin event system for cross-process notification

## Rollout Event Persistence Policy

### Source File

`codex-rs/rollout/src/policy.rs` — function `event_msg_persistence_mode()`.

The rollout recorder does NOT persist all events to the JSONL file. Each
`EventMsg` variant has a persistence mode:

| Mode       | Meaning                                     |
|------------|---------------------------------------------|
| `Limited`  | Always persisted (default mode)             |
| `Extended` | Only persisted when extended mode is active |
| `None`     | Never persisted to rollout files            |

### Persisted in Limited Mode (always available)

These are the events always present in rollout files:

| EventMsg variant              | Payload type             | Status inference      |
|-------------------------------|--------------------------|-----------------------|
| `TurnStarted`                 | `turn_started`           | → active              |
| `TurnComplete`                | `turn_complete`          | → idle                |
| `TurnAborted`                 | `turn_aborted`           | → idle                |
| `TaskStarted` (v1)            | `task_started`           | → active              |
| `TaskComplete` (v1)           | `task_complete`          | → idle                |
| `UserMessage`                 | `user_message`           | —                     |
| `AgentMessage`                | `agent_message`          | —                     |
| `AgentReasoning`              | `agent_reasoning`        | —                     |
| `AgentReasoningRawContent`    | —                        | —                     |
| `TokenCount`                  | `token_count`            | —                     |
| `ThreadNameUpdated`           | `thread_name_updated`    | —                     |
| `ContextCompacted`            | `context_compacted`      | —                     |
| `EnteredReviewMode`           | `entered_review_mode`    | —                     |
| `ExitedReviewMode`            | `exited_review_mode`     | —                     |
| `ThreadRolledBack`            | `thread_rolled_back`     | —                     |
| `UndoCompleted`               | `undo_completed`         | —                     |
| `ImageGenerationEnd`          | `image_generation_end`   | —                     |
| `ItemCompleted` (Plan only)   | `item_completed`         | —                     |

Note: `ItemCompleted` is only persisted when the item is a `Plan` — all other
item types are not persisted. This is a conditional rule in
`event_msg_persistence_mode()`.

### Persisted in Extended Mode Only

These require the rollout recorder to be configured with
`EventPersistenceMode::Extended`:

| EventMsg variant                | Notes                          |
|---------------------------------|--------------------------------|
| `Error`                         | Agent errors → maps to idle    |
| `ExecCommandEnd`                | Command execution summaries    |
| `GuardianAssessment`            | Guardian sub-agent assessments |
| `WebSearchEnd`                  | Web search results             |
| `McpToolCallEnd`                | MCP tool call results          |
| `PatchApplyEnd`                 | Patch application results      |
| `ViewImageToolCall`             | Image tool calls               |
| `CollabAgentSpawnEnd`           | Collaborative agent spawning   |
| `CollabAgentInteractionEnd`     | Collaborative agent interaction|
| `CollabWaitingEnd`              | Collaborative agent waiting    |
| `CollabCloseEnd`                | Collaborative agent close      |
| `CollabResumeEnd`               | Collaborative agent resume     |
| `DynamicToolCallRequest`        | Dynamic tool requests          |
| `DynamicToolCallResponse`       | Dynamic tool responses         |

**Note**: `error` maps to `idle` in our status inference, but it may not be
available if the recorder is in Limited mode.

### NEVER Persisted (persistence mode = None)

These events are **ephemeral** — they only exist in the app-server's in-memory
state and are delivered to connected clients in real-time. They are **never
written to rollout files**. This is the complete list from `policy.rs`:

**Approval and input events** (affect status, but invisible to filesystem):

| EventMsg variant               | Payload type                      | Status            |
|--------------------------------|-----------------------------------|-------------------|
| `ExecApprovalRequest`          | `exec_approval_request`           | waitingOnApproval |
| `ApplyPatchApprovalRequest`    | `apply_patch_approval_request`    | waitingOnApproval |
| `RequestPermissions`           | `request_permissions`             | waitingOnApproval |
| `RequestUserInput`             | `request_user_input`              | waitingOnUserInput |
| `ElicitationRequest`           | `elicitation_request`             | —                 |

**Lifecycle events** (never persisted):

| EventMsg variant               | Reason                            |
|--------------------------------|-----------------------------------|
| `ShutdownComplete`             | Process lifecycle, not history    |
| `ItemStarted`                  | Redundant with ResponseItems      |
| `ItemCompleted` (non-Plan)     | Redundant with ResponseItems      |
| `UndoStarted`                  | Transient UI state                |

**Streaming/delta events** (too frequent, not useful for history):

| EventMsg variant                                |
|-------------------------------------------------|
| `AgentMessageDelta`                             |
| `AgentMessageContentDelta`                      |
| `AgentReasoningDelta`                           |
| `AgentReasoningSectionBreak`                    |
| `AgentReasoningRawContentDelta`                 |
| `ReasoningContentDelta` / `ReasoningRawContentDelta` |
| `ExecCommandOutputDelta`                        |
| `PlanDelta`                                     |
| `RawResponseItem`                               |

**Begin events** (paired with End events, not needed for replay):

| EventMsg variant                                |
|-------------------------------------------------|
| `McpToolCallBegin`                              |
| `WebSearchBegin`                                |
| `ExecCommandBegin`                              |
| `PatchApplyBegin`                               |
| `ImageGenerationBegin`                          |
| `CollabAgentSpawnBegin` through `CollabResumeBegin` |

**Other ephemeral events**:

| EventMsg variant               | Reason                            |
|--------------------------------|-----------------------------------|
| `Warning`                      | Transient                         |
| `DeprecationNotice`            | Transient                         |
| `StreamError`                  | Transient                         |
| `ModelReroute`                 | Transient                         |
| `BackgroundEvent`              | Transient                         |
| `TurnDiff`                     | Transient                         |
| `SessionConfigured`            | Transient                         |
| `TerminalInteraction`          | Transient                         |
| `HookStarted` / `HookCompleted`| Transient                         |
| `PlanUpdate`                   | Transient                         |
| `McpStartupUpdate` / `Complete`| Transient                         |
| `McpListToolsResponse`         | Request/response, not history     |
| `GetHistoryEntryResponse`      | Request/response, not history     |
| `ListSkillsResponse`           | Request/response, not history     |
| `AddCreditsNudgeEmailResponse` | Request/response, not history     |
| `SkillsUpdateAvailable`        | Transient                         |
| `RealtimeConversation*`        | Voice, not history                |

### Critical Implication for External Thread Status

**Filesystem-based status inference CANNOT detect `waitingOnApproval` or
`waitingOnUserInput` for external threads.** The data simply does not exist in
rollout files.

For external threads (managed by another app-server instance, e.g., TUI/CLI):

| What we CAN detect from rollout | What we CANNOT detect             |
|----------------------------------|-----------------------------------|
| Turn started → active            | Waiting for approval              |
| Turn complete → idle             | Waiting for user input            |
| Turn aborted → idle              | Specific error details            |
| Thread name updates              | Streaming progress (deltas)       |

When a thread is `active` (last event is `turn_started`/`task_started`), it
could be:
- Actively processing (agent is running)
- Waiting for approval (user needs to approve a command)
- Waiting for user input (agent asked a question)
- Waiting for elicitation (MCP server requesting info)

All of these states look identical in the rollout file — the last lifecycle
event is `turn_started`/`task_started` with no subsequent `turn_complete` or
`turn_aborted`.

### Upstream Status Mapping

**Source**: `codex-rs/core/src/agent/status.rs` — function
`agent_status_from_event()`:

```rust
match msg {
    EventMsg::TurnStarted(_)         => Some(AgentStatus::Running),
    EventMsg::TurnComplete(_)        => Some(AgentStatus::Completed(_)),
    EventMsg::TurnAborted(ev)        => match ev.reason {
        Interrupted => Some(AgentStatus::Interrupted),
        _           => Some(AgentStatus::Errored(_)),
    },
    EventMsg::Error(ev)              => Some(AgentStatus::Errored(ev.message)),
    EventMsg::ShutdownComplete       => Some(AgentStatus::Shutdown),
    _                                => None,
}
```

Note: `AgentStatus::Interrupted` is NOT considered "final" by the upstream
`is_final()` check — the agent can be restarted after an interrupt. But for
our purposes, it maps to `idle` since the thread is not actively running.

### How Paseo Handles This

Paseo (a similar project) solves this by **not supporting external threads at
all**. Every Paseo session is managed through its own spawned `codex
app-server` subprocess with direct JSON-RPC communication. Real-time events
including approval requests flow through the JSON-RPC connection, not the
filesystem. Paseo reads rollout files only for historical timeline
reconstruction, never for status detection.

## Implications for my-codex-app

### Why the Bridge Misses TUI Events

1. User runs `codex` → embedded app-server starts in-process
2. Bridge runs `codex app-server` → separate child process via stdio
3. TUI sends a message → events flow within the TUI's process only
4. Bridge's app-server never receives these events
5. Bridge cannot forward them to mobile clients

### Detection Strategy

Since the bridge cannot receive real-time events from the TUI's app-server,
it must detect changes through the shared filesystem:

1. **Filesystem watching**: Monitor `~/.codex/sessions/` recursively for
   `.jsonl` file changes (using `chokidar` with FSEvents on macOS)
2. **On-change refresh**: When changes detected, call `listThreads` (which
   scans the filesystem) to get the latest state
3. **Diff and broadcast**: Compare with cached state, emit synthetic
   `threadStatusChanged` events, broadcast to global SSE clients
4. **Status enrichment**: For threads returning `notLoaded` from the bridge's
   app-server (external threads not subscribed via `resumeThread`), read the
   rollout file tail to infer the actual runtime status from the last lifecycle
   event (see Rollout Event Persistence Policy section above)

### Known Limitations of External Thread Detection

External threads (managed by TUI/CLI app-server instances) have these
limitations compared to bridge-managed threads:

1. **Approval/input states undetectable**: Since `exec_approval_request`,
   `request_user_input`, and `request_permissions` events are never persisted
   to rollout files, external threads always show "活跃" (active) during
   approval waits rather than "等待审批" or "等待输入"

2. **Status granularity limited to active/idle**: The rollout file can only
   tell us whether a turn is in progress (`turn_started`/`task_started`) or
   completed (`turn_complete`/`task_complete`/`turn_aborted`). We cannot
   distinguish sub-states of an active turn.

3. **Update latency**: Changes are detected via filesystem watching with a
   500ms debounce, so there is inherent delay compared to real-time event
   streaming.

### Future Improvement: Shared App-Server

If the bridge's app-server listened on WebSocket (instead of stdio), and the
TUI connected via `codex --remote ws://...`, both would share the same instance
and events would flow natively. This requires:

1. Bridge's app-server supports dual transport (stdio + WebSocket), or switches
   to WebSocket only
2. A configuration mechanism for the TUI to auto-discover the bridge's
   app-server
3. Upstream contribution to support multiple concurrent transports
