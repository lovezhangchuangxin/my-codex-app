# Codex Upstream Integration Guide

## Purpose

This document is the standing reference for how `my-codex-app` should read and
use the local upstream Codex source repository at:

- `$CODEX_SOURCE_CODE_HOME` — read this value from the project root `.env` file. If `.env` does not exist or `CODEX_SOURCE_CODE_HOME` is empty, ask the user to create `.env` (copy from `.env.example`) and set the path before continuing.

The goal is to avoid re-discovering the same upstream structure in every new
session. For most `my-codex-app` tasks, this guide should be read before doing a
fresh upstream code sweep.

## What Matters To `my-codex-app`

`my-codex-app` does not integrate with arbitrary Codex internals. The main
upstream authority for us is:

- `codex app-server`
- its protocol schema
- its thread / turn / request lifecycle behavior
- its event ordering and recovery semantics

That means most of the time we should focus on a small subset of the Codex repo
instead of treating the whole workspace as equally relevant.

## Upstream Repo Map

At the top level, the upstream repo has three big areas:

- `codex-cli/`
  - packaging and CLI distribution helpers
  - usually not the first place to look for `my-codex-app` integration work
- `codex-rs/`
  - the main Rust workspace
  - this is where nearly all integration-relevant source lives
- `sdk/`
  - official client references
  - useful for seeing how upstream expects app-server to be consumed

For `my-codex-app`, the practical center of gravity is `codex-rs/`.

## Primary Upstream Modules

### 1. `codex-rs/app-server`

Role:

- the JSON-RPC server surface we integrate with
- the official bridge-facing runtime for thread, turn, request, and event flows

Read first:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server/src/lib.rs`

Most useful files:

- `codex-rs/app-server/src/message_processor.rs`
  - top-level request routing, connection session state, initialization gating
- `codex-rs/app-server/src/codex_message_processor.rs`
  - thread and turn operations, resume/unsubscribe behavior, request replay, lifecycle handling
- `codex-rs/app-server/src/outgoing_message.rs`
  - outgoing notifications, server-initiated requests, callback tracking, request replay/cancel
- `codex-rs/app-server/src/thread_state.rs`
  - subscriber bookkeeping, thread listener command sequencing, ordered request resolution
- `codex-rs/app-server/src/thread_status.rs`
  - loaded thread status propagation

What it gives `my-codex-app`:

- the authoritative meaning of `thread/start`
- the authoritative meaning of `thread/resume`
- the authoritative meaning of `thread/unsubscribe`
- the canonical request/notification lifecycle for approvals and user input

### 2. `codex-rs/app-server-protocol`

Role:

- typed app-server request/response/notification schema
- JSON schema and TypeScript generation source

Read first:

- `codex-rs/app-server-protocol/src/lib.rs`
- `codex-rs/app-server-protocol/src/protocol/v2.rs`

Most useful files:

- `codex-rs/app-server-protocol/src/protocol/v2.rs`
  - stable v2 request/response/notification types
- `codex-rs/app-server-protocol/src/protocol/common.rs`
  - method registration and protocol wiring
- `codex-rs/app-server-protocol/src/export.rs`
  - schema export path used by generated artifacts

What it gives `my-codex-app`:

- field names and shapes for upstream thread/turn/request payloads
- which fields are populated only on `thread/read` / `thread/resume`
- which APIs are experimental and should not be assumed stable

### 3. `codex-rs/core`

Role:

- the actual Codex runtime engine behind app-server
- thread creation, thread resumption, turn execution, tools, rollouts, sandboxing

Read first:

- `codex-rs/core/src/lib.rs`

Most useful files:

- `codex-rs/core/src/thread_manager.rs`
  - in-memory thread registry, start/resume/fork/remove behavior
- `codex-rs/core/src/codex_thread.rs`
  - per-thread runtime object exposed to app-server
- `codex-rs/core/src/rollout.rs`
  - persisted rollout reading/writing helpers
- `codex-rs/core/src/state_db_bridge.rs`
  - bridge between runtime and persisted state DB metadata
- `codex-rs/core/src/tools/`
  - request/approval/user-input producing tool handlers

What it gives `my-codex-app`:

- the deeper reason why app-server behaves as it does
- the difference between loaded thread state and persisted rollout state
- the runtime objects app-server wraps and subscribes to

### 4. `codex-rs/protocol`

Role:

- core shared domain types used by CLI/core/app-server
- internal event model and request/approval/user-input payload types

Read first:

- `codex-rs/protocol/README.md`
- `codex-rs/protocol/src/lib.rs`

Most useful files:

- `codex-rs/protocol/src/protocol.rs`
  - `EventMsg` and core event types
- `codex-rs/protocol/src/approvals.rs`
  - command/file-change approval payloads and decisions
- `codex-rs/protocol/src/request_user_input.rs`
  - structured tool user-input questions and answers
- `codex-rs/protocol/src/permissions.rs`
  - permission profile types

What it gives `my-codex-app`:

- the upstream semantic model behind app-server notifications and requests
- the authoritative shape of approval and user-input data before app-server remaps it

### 5. `codex-rs/state`

Role:

- local SQLite metadata and log persistence
- rollout-derived thread metadata cache

Read first:

- `codex-rs/state/src/lib.rs`
- `codex-rs/state/src/runtime.rs`

What it gives `my-codex-app`:

- how upstream persists thread metadata outside the live in-memory runtime
- where rollout-derived listing and metadata come from
- useful context for future relay or remote-enrollment work

This is secondary for current local-direct work, but still useful when a
question involves persistence rather than live event behavior.

### 6. Official SDKs and Examples

Role:

- reference clients for the supported app-server surface

Most useful files:

- `sdk/python/src/codex_app_server/client.py`
- `sdk/python/examples/03_turn_stream_events/*`
- `sdk/python/examples/05_existing_thread/*`
- `sdk/python/examples/06_thread_lifecycle_and_controls/*`
- `sdk/python/examples/14_turn_controls/*`
- `sdk/typescript/src/thread.ts`

What they give `my-codex-app`:

- a reference for the `initialize` handshake and normal request sequence
- a reference for streamed turn consumption
- a reference for start/resume/interrupt usage from a client perspective

Important limitation:

- `sdk/typescript/src/thread.ts` is useful for the high-level SDK consumption
  model, but it is **not** the authority for rich app-server composer behavior
  such as slash commands, file search, skill references, or structured
  `mention` items
- when a task is about browser/TUI-style composer semantics, prefer
  `app-server-protocol`, `app-server/README.md`, and `codex-rs/tui`

### 7. `codex-rs/tui` for composer and popup behavior

Role:

- the best upstream reference for how Codex's own interactive composer behaves
- source of truth for slash popup activation, `@` file search popup behavior,
  skill/app/plugin mention insertion, and composer-local dispatch rules

Read first when the task is about command entry or inline references:

- `codex-rs/tui/src/bottom_pane/chat_composer.rs`
- `codex-rs/tui/src/bottom_pane/command_popup.rs`
- `codex-rs/tui/src/bottom_pane/file_search_popup.rs`
- `codex-rs/tui/src/bottom_pane/skill_popup.rs`
- `codex-rs/tui/src/chatwidget.rs`
- `codex-rs/tui/src/file_search.rs`

What it gives `my-codex-app`:

- when `/...` is treated as a command vs plain text
- when `@...` is treated as file search vs ordinary text
- how selected mentions are inserted into visible text
- which behaviors are local client affordances rather than upstream app-server
  methods

## Core Architecture For Our Integration

The architecture we actually depend on is:

1. A client opens one transport connection to app-server.
2. The client sends `initialize`.
3. The client sends `initialized`.
4. The client creates or resumes a thread.
5. App-server auto-subscribes that connection to thread events.
6. Turns, items, approvals, and user-input requests are streamed back over the same logical connection.
7. The client answers server-initiated requests.
8. App-server emits `serverRequest/resolved` when those requests are cleared.
9. If the connection unsubscribes from the thread and it was the last subscriber, app-server unloads the thread.

For `my-codex-app`, the bridge is a transport and normalization layer on top of
that model. It should not invent a conflicting thread lifecycle.

## Upstream Semantics We Reuse Directly

### Initialization

Source:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server/src/message_processor.rs`

Important points:

- app-server requires one `initialize` request per transport connection
- the client must follow it with `initialized`
- repeated or missing initialization is rejected

Implication for `my-codex-app`:

- our bridge owns one long-lived upstream app-server connection
- browser/mobile clients do not speak raw app-server JSON-RPC directly

### Thread start vs resume vs read

Source:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server-protocol/src/protocol/v2.rs`
- `codex-rs/app-server/src/codex_message_processor.rs`

Important points:

- `thread/start` creates a new live thread and emits `thread/started`
- `thread/resume` reopens an existing thread and does not emit a second `thread/started`
- `thread/read` reads persisted thread state without resuming it

Important payload rule:

- `Thread.turns` is only populated on:
  - `thread/read` with `includeTurns`
  - `thread/resume`
  - `thread/fork`
  - rollback responses
- `Turn.items` is only populated on resume/fork-style history-bearing responses

Implication for `my-codex-app`:

- use `thread/read` for authoritative detail snapshots
- use `thread/resume` only for maintaining live upstream subscription behavior in the bridge
- do not assume live notifications contain full historical turns/items

### Unsubscribe and unload

Source:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server/src/codex_message_processor.rs`
- `codex-rs/app-server/src/thread_state.rs`
- `codex-rs/app-server/tests/suite/v2/thread_unsubscribe.rs`

Important points:

- `thread/unsubscribe` removes the current connection's subscription to a thread
- if that was the last subscriber, app-server shuts down and unloads the thread
- app-server emits:
  - `thread/status/changed` to `notLoaded`
  - `thread/closed`
- pending app-server -> client requests for that thread are canceled during unload

Implication for `my-codex-app`:

- the bridge must be careful when deciding to call upstream `thread/unsubscribe`
- short browser disconnects should not automatically trigger unload if we want fast reconnect/resync

### Pending approvals and tool user input

Source:

- `codex-rs/protocol/src/approvals.rs`
- `codex-rs/protocol/src/request_user_input.rs`
- `codex-rs/app-server/README.md`
- `codex-rs/app-server/tests/suite/v2/request_permissions.rs`
- `codex-rs/app-server/tests/suite/v2/request_user_input.rs`
- `codex-rs/app-server/tests/suite/v2/turn_start.rs`

Important points:

- approvals and user input are server-initiated JSON-RPC requests
- these are part of the thread/turn lifecycle, not a separate side channel
- app-server emits `serverRequest/resolved` when a pending request is answered or cleaned up

Implication for `my-codex-app`:

- the bridge should track pending requests as bridge authority
- the client should not infer request completion only from local mutation success
- `serverRequest/resolved` matters for correct pending-request cleanup

### `serverRequest/resolved` ordering

Source:

- `codex-rs/app-server/src/thread_state.rs`
- `codex-rs/app-server/src/codex_message_processor.rs`
- `codex-rs/app-server/src/outgoing_message.rs`
- `codex-rs/app-server/tests/suite/v2/turn_start.rs`
- `codex-rs/app-server/tests/suite/v2/request_user_input.rs`
- `codex-rs/app-server/tests/suite/v2/request_permissions.rs`

Important points:

- app-server resolves request cleanup on the thread listener command path
- this is done specifically to preserve ordering with thread events
- upstream tests assert that `serverRequest/resolved` arrives before the final `turn/completed`

Implication for `my-codex-app`:

- our bridge and client should preserve that ordering contract
- if our local protocol changes the apparent order, our implementation is wrong

### Structured turn input vs client-side composer affordances

Source:

- `codex-rs/protocol/src/user_input.rs`
- `codex-rs/app-server/README.md`
- `codex-rs/tui/src/bottom_pane/chat_composer.rs`
- `codex-rs/tui/src/chatwidget.rs`

Important points:

- upstream `turn/start.input` supports structured user input items such as:
  - `text`
  - `image`
  - `localImage`
  - `skill`
  - `mention`
- however, not every visible composer affordance becomes a structured item
- in particular:
  - `@` file search in the TUI inserts a path into text; it is **not** encoded
    as a structured `mention`
  - skill/app/plugin references may use visible `$name` or `@name` tokens in
    text **plus** extra structured `skill` / `mention` items so Codex receives
    the exact target identity

Implication for `my-codex-app`:

- do not assume that every special-looking token in the composer maps to a
  structured app-server input item
- for file references, it is correct to treat selection as text insertion
- for skill/app/plugin work, read both the visible-text rules and the hidden
  structured-item rules before designing the client protocol

### Slash commands are partly UI semantics, not just prompt text

Source:

- `codex-rs/tui/src/slash_command.rs`
- `codex-rs/tui/src/bottom_pane/slash_commands.rs`
- `codex-rs/tui/src/bottom_pane/chat_composer.rs`
- `codex-rs/tui/src/chatwidget.rs`

Important points:

- upstream slash commands are discovered and filtered by the TUI, not by
  app-server
- some slash commands dispatch dedicated actions instead of submitting literal
  `/command` text to `turn/start`
- examples:
  - `/compact` dispatches manual context compaction
  - `/review` opens or dispatches the review flow
  - `/mention` is only a helper that inserts `@`
  - `/model` and `/permissions` are local settings affordances
- if a slash token does not resolve to a supported command, it can still remain
  ordinary text

Implication for `my-codex-app`:

- when adding slash-command support, first decide whether each command is:
  - a bridge/app-server action
  - a local client helper
  - or just plain text fallback
- do not blindly forward slash-prefixed text as if upstream guaranteed the same
  behavior

### File search is a client feature, not an app-server RPC

Source:

- `codex-rs/tui/src/file_search.rs`
- `codex-rs/tui/src/bottom_pane/chat_composer.rs`
- `codex-rs/app-server/README.md`

Important points:

- upstream app-server exposes filesystem reads such as:
  - `fs/readDirectory`
  - `fs/readFile`
  - `fs/getMetadata`
- upstream app-server does **not** expose a dedicated file-search RPC for the
  TUI `@` flow
- the TUI implements `@` search on the client side using a local file-search
  session rooted at the current workspace

Implication for `my-codex-app`:

- if the browser client needs `@` file search, the bridge must provide its own
  typed search capability rooted at `thread.cwd`
- do not waste time looking for a native upstream `file/search` app-server
  method that does not exist

### Review, compaction, and shell-command lifecycle

Source:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server-protocol/src/protocol/v2.rs`

Important points:

- `thread/compact/start` returns `{}` immediately and then reports progress via
  normal `turn/*` and `item/*` notifications
- the item to watch for compaction is `contextCompaction`
- `review/start` emits:
  - `enteredReviewMode`
  - `exitedReviewMode`
  - and a final assistant `agentMessage` containing the review text
- `thread/shellCommand` is the app-server surface behind the TUI `!` workflow
- `thread/shellCommand` runs unsandboxed with full access and also streams
  normal command/turn items

Implication for `my-codex-app`:

- compaction and review should be integrated into the normal thread event model,
  not treated as isolated side effects
- review UIs should account for both review-mode items and the final assistant
  message so they do not accidentally double-render the same review text
- exposing `!`-style shell commands requires an explicit product decision
  because upstream treats them as unsandboxed full-access actions

### Detached review is upstream-capable but only useful if our runtime can follow it

Source:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server-protocol/src/protocol/v2.rs`

Important points:

- upstream review supports:
  - `delivery: "inline"`
  - `delivery: "detached"`
- detached review runs in a new review thread and emits `thread/started` for
  that thread before the review stream

Implication for `my-codex-app`:

- do not expose detached review from our shared client-facing protocol unless
  the bridge, SDK, and client runtime can all:
  - surface the new `reviewThreadId`
  - subscribe to that thread's event stream
  - and update local state coherently
- upstream support alone is not enough; our mediated runtime must support the
  full lifecycle too

## Fast Lookup: Where To Read For Common Questions

### “What is the official app-server method or payload shape?”

Read:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server-protocol/src/protocol/v2.rs`

### “What does app-server actually do at runtime?”

Read:

- `codex-rs/app-server/src/message_processor.rs`
- `codex-rs/app-server/src/codex_message_processor.rs`
- `codex-rs/app-server/src/thread_state.rs`
- `codex-rs/app-server/src/outgoing_message.rs`

### “How does resume / reconnect / unsubscribe really behave?”

Read:

- `codex-rs/app-server/tests/suite/v2/thread_resume.rs`
- `codex-rs/app-server/tests/suite/v2/thread_read.rs`
- `codex-rs/app-server/tests/suite/v2/thread_unsubscribe.rs`

### “How do approvals, permissions, and tool user input work?”

Read:

- `codex-rs/protocol/src/approvals.rs`
- `codex-rs/protocol/src/request_user_input.rs`
- `codex-rs/app-server/tests/suite/v2/turn_start.rs`
- `codex-rs/app-server/tests/suite/v2/request_permissions.rs`
- `codex-rs/app-server/tests/suite/v2/request_user_input.rs`
- `codex-rs/app-server/tests/suite/v2/turn_interrupt.rs`

### “How do slash commands, `@` file search, and mentions actually behave?”

Read:

- `codex-rs/tui/src/bottom_pane/chat_composer.rs`
- `codex-rs/tui/src/bottom_pane/command_popup.rs`
- `codex-rs/tui/src/bottom_pane/file_search_popup.rs`
- `codex-rs/tui/src/bottom_pane/skill_popup.rs`
- `codex-rs/tui/src/chatwidget.rs`
- `codex-rs/tui/src/file_search.rs`

Key reminder:

- slash commands are mostly TUI/client behavior
- `@` file search is client-side search, not app-server protocol
- structured `mention` items are for exact app/plugin targets, not ordinary file
  references

### “How do review and manual compaction stream back?”

Read:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server-protocol/src/protocol/v2.rs`
- `codex-rs/app-server/tests/suite/v2/turn_start.rs`

### “How would an official client consume this?”

Read:

- `sdk/python/src/codex_app_server/client.py`
- `sdk/python/examples/03_turn_stream_events/*`
- `sdk/python/examples/05_existing_thread/*`
- `sdk/python/examples/06_thread_lifecycle_and_controls/*`
- `sdk/python/examples/14_turn_controls/*`

## Recommended Reading Order For `my-codex-app` Tasks

For most upstream-related tasks, read in this order:

1. `codex-rs/app-server/README.md`
2. `codex-rs/app-server-protocol/src/protocol/v2.rs`
3. the relevant `codex-rs/app-server/tests/suite/v2/*.rs`
4. only then the matching `app-server/src/*.rs` implementation files
5. go into `codex-rs/core/` only when the app-server behavior still needs explanation

This is usually faster and safer than starting in `codex-rs/core/` every time.

## How This Maps To `my-codex-app`

### `apps/bridge`

Should be viewed as:

- an adapter from upstream app-server JSON-RPC to our own HTTP + SSE surface
- a local authority for client reconnect/recovery
- not a replacement semantic model for thread execution

### `packages/protocol`

Should:

- stay typed and explicit
- reflect the subset of upstream semantics we actually expose
- avoid leaking raw app-server/internal-core types wholesale into the browser client

### `packages/sdk` and `apps/client`

Should assume:

- bridge authority, not raw upstream transport access
- reconnect by re-reading bridge-authoritative state
- upstream request and event ordering still matters, but is mediated through the bridge

## What We Should Not Depend On

- private desktop IPC or window-specific behavior
- random internal `core` implementation details when `app-server` already defines the contract
- experimental app-server fields unless we intentionally opt in and document why
- optimistic client-side reconstruction of pending-request lifecycles that conflicts with upstream ordering

## Working Assumptions For Future Sessions

Unless a task clearly says otherwise, assume:

- the first upstream reference point is `codex-rs/app-server`
- the protocol authority is `codex-rs/app-server-protocol`
- runtime lifecycle truth is validated by `codex-rs/app-server/tests/suite/v2`
- `thread/resume`, `thread/read`, `thread/unsubscribe`, approvals, permissions, user input, and `serverRequest/resolved` are the main upstream semantics that affect `my-codex-app`
- composer behavior involving `/`, `@`, skills, apps, or plugin mentions is
  usually rooted in `codex-rs/tui`, not in the official SDK helpers

If a future task touches relay, remote control, or upstream auth/account flows,
expand outward from this guide rather than restarting from the entire Codex
workspace.
