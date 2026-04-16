# Approval and Reasoning Parity

## Relationship To Existing Docs

This spec extends and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-12-thread-chat-flow.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`
- `docs/reference/2026-04-11-codex-upstream-integration-guide.md`

It defines parity-focused improvements for approval flows and reasoning display.
It does not change the core architecture (client -> bridge -> codex app-server)
or introduce relay-specific behavior.

## Background

The current implementation already supports core pending-request workflows and
basic reasoning rendering, but there are still upstream parity gaps in two
high-impact areas:

1. Approval fidelity:
   - command approval decisions are reduced to a smaller local decision set
   - rich request context fields from app-server are not fully surfaced in the
     local protocol/UI
   - request actions in UI do not expose full decision choices in some cases
2. Reasoning visibility:
   - reasoning content is shown only after item snapshots, not streamed from
     reasoning delta notifications
   - "thinking time" is not clearly exposed in thread detail

These gaps reduce remote-control confidence for approval-sensitive actions and
make ongoing thinking progress harder to understand on mobile.

## Goals

- Reach practical parity with upstream app-server approval semantics for the
  shared Web/mobile client surface.
- Preserve upstream request lifecycle ordering, especially
  `serverRequest/resolved` behavior.
- Add streaming reasoning rendering based on reasoning delta notifications.
- Add explicit and non-misleading timing display related to thinking progress.
- Keep protocol, bridge, sdk, and client changes typed and consistent.

## Non-Goals

- Full UI parity with every Codex-native surface (TUI/VS Code specific UX).
- New relay behavior, new auth model, or pairing flow changes.
- New persistence layer for cross-process pending requests.
- New upstream methods; this slice only consumes existing app-server semantics.
- Replacing current thread detail layout or composer architecture.
- `mcpServer/elicitation/request` UX parity in this slice.
- `item/tool/call` dynamic tool-call UX parity in this slice.

## Scope

### In scope

- Approval parity for:
  - `item/commandExecution/requestApproval`
  - `item/fileChange/requestApproval`
  - `item/permissions/requestApproval`
  - `item/tool/requestUserInput`
- Legacy request compatibility for:
  - `execCommandApproval`
  - `applyPatchApproval`
- Reasoning streaming parity for:
  - `item/reasoning/summaryPartAdded`
  - `item/reasoning/summaryTextDelta`
  - `item/reasoning/textDelta`
- Thinking-related timing display rules in thread detail.

### Out of scope

- New approval request types outside the methods above.
- New turn/item storage persistence semantics.

## User Requirements

### Approval experience

- Pending approval cards must show enough context to make safe decisions on
  mobile without guessing.
- Command approval actions must support all meaningful upstream decisions when
  those decisions are advertised by app-server.
- If app-server provides an explicit decision whitelist, UI should follow it
  instead of showing hard-coded action buttons.
- If `availableDecisions` is absent, UI should fall back to upstream-compatible
  default decision derivation based on request fields.
- Request cleanup must stay driven by `serverRequest/resolved`, not optimistic
  local removal.

### Reasoning experience

- While a turn is in progress, users should see reasoning content update
  incrementally when upstream emits reasoning deltas.
- The reasoning block should clearly indicate whether thinking is still in
  progress or completed.
- Timing display must distinguish between:
  - upstream canonical timing (turn-level timestamps/duration)
  - local derived timing used for live UX hints
- Timing labels must not imply that reasoning items carry canonical duration in
  upstream protocol.

## Upstream Semantics To Preserve

- Approval and user-input prompts are server-initiated JSON-RPC requests.
- `serverRequest/resolved` is the authoritative request resolution signal.
- Upstream supports richer command decisions beyond accept/decline.
- `availableDecisions` in command approval params is optional/experimental and
  may be absent.
- Reasoning incremental events are emitted via:
  - `item/reasoning/summaryPartAdded`
  - `item/reasoning/summaryTextDelta`
  - `item/reasoning/textDelta`
- `Turn` includes `startedAt`, `completedAt`, and `durationMs` as canonical
  timing fields.

## Solution Overview

## 1) Approval parity model

### Protocol changes

Extend local pending command request shape to carry richer optional context:

- `commandActions`
- `availableDecisions`
- `additionalPermissions`
- `networkApprovalContext`
- `proposedExecpolicyAmendment`
- `proposedNetworkPolicyAmendments`

Extend local command approval decision type to support richer variants mapped
from upstream command decisions, while keeping backward-compatible support for
existing simple decisions.

File-change, permissions, and user-input request shapes remain mostly stable,
except for any normalization needed for display consistency.

### Bridge changes

- Keep dual compatibility for v2 and legacy request methods.
- Pass through richer v2 command-approval fields into local pending request
  model.
- Map local command decision payloads back to the exact app-server response
  shape expected by each request method.
- Keep per-request resolution event (`pendingRequestResolved`) driven by
  `serverRequest/resolved` notification handling.
- Keep thread-level forced cleanup (`thread/closed` and unload paths) as a
  separate lifecycle path for clearing all pending requests.

### Client changes

- Render approval actions from `availableDecisions` when present.
- Fallback to current default button sets when `availableDecisions` is absent.
- Add explicit cancel action in approval UIs where supported.
- Render additional approval context blocks (permissions/network/policy hints)
  when provided.

## 2) Reasoning streaming + timing model

### Protocol and bridge event model

Add bridge events for reasoning delta notifications so sdk/client can merge
reasoning incrementally into selected thread detail state.

### SDK runtime behavior

- Apply reasoning delta events in order to the active turn/item state.
- Create or update reasoning item snapshots as deltas arrive.
- Preserve existing snapshot-based behavior for compatibility when deltas are
  missing.

### Client rendering behavior

- Thinking block supports live append for summary/content segments.
- Visual status:
  - in progress: streaming indicator + live elapsed hint
  - completed: stable content + completion timing labels

### Timing semantics

Canonical timing (authoritative):

- `turn.startedAt`
- `turn.completedAt`
- `turn.durationMs`
- There is no canonical reasoning-item duration field in upstream `ThreadItem`.

Derived timing (UI hint only):

- optional live elapsed timer measured locally from first reasoning delta until
  completion (or current time while active)

UI copy must avoid implying derived timing is upstream-persisted truth.

## Validation Requirements

- Approval action rendering is deterministic:
  - when `availableDecisions` exists, render exactly those decisions in order
  - when missing, derive fallback actions from known request fields
- Command decision mapping must be verifiably correct for:
  - `accept`
  - `acceptForSession`
  - `acceptWithExecpolicyAmendment`
  - `applyNetworkPolicyAmendment`
  - `decline`
  - `cancel`
- Reasoning delta merge correctness is verifiable across:
  - summary section boundaries
  - summary text append
  - raw reasoning text append
- Reasoning/timing UI must be verifiably non-misleading:
  - canonical turn timing and derived live timing are visually and textually
    distinct.

## Module Responsibilities

### `packages/protocol`

- Add richer command approval decision and request context types.
- Add reasoning delta bridge event types.

### `apps/bridge`

- Translate app-server reasoning delta notifications into bridge events.
- Translate richer command approval requests/decisions in both directions.
- Preserve ordering and request lifecycle semantics.

### `packages/sdk`

- Merge new reasoning delta events into thread detail state.
- Keep pending request and turn lifecycle behavior consistent.

### `apps/client`

- Update pending request cards/actions for richer approval semantics.
- Update thinking block for streaming reasoning + timing display.

## Error Handling And Fallbacks

- If richer approval fields are missing, UI falls back to current basic action
  set and basic context rendering.
- If reasoning delta events are not observed, client still renders reasoning
  from item snapshots.
- If local live elapsed timer state is unavailable (tab background/throttling),
  UI shows canonical turn timing only.
- Any bridge mapping failure should fail closed for approval actions and report
  a clear error instead of silently sending malformed responses.

## Compatibility And Migration

- Preserve support for legacy request methods (`execCommandApproval`,
  `applyPatchApproval`) during transition.
- Keep existing pending-request storage structures compatible by using optional
  additions.
- No data migration is required for persisted thread history.

## Risks

- Incorrect decision mapping may send unintended approval outcomes.
- Out-of-order reasoning delta handling could create duplicated or garbled
  reasoning content.
- UI complexity growth in approval cards may hurt mobile readability if not
  constrained.

## Acceptance Criteria

- Command approval UI can represent and submit richer upstream decisions when
  advertised by app-server.
- Command approval UI follows upstream decision ordering when
  `availableDecisions` is present.
- Pending request cards show richer command approval context when provided.
- Request cleanup remains driven by `serverRequest/resolved` and matches current
  ordering expectations.
- Reasoning text updates incrementally during active turns using reasoning delta
  events.
- Reasoning delta rendering remains correct when summary/content indexes advance.
- Thread detail shows explicit timing related to thinking progress without
  mislabeling derived timing as authoritative persisted timing.
- Type consistency is preserved across protocol, bridge, sdk, and client.
