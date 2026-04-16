# Implementation Plan: Approval and Reasoning Parity

This plan implements:

- `docs/specs/2026-04-16-approval-and-reasoning-parity.md`

Implementation order follows dependency direction:

1. `protocol`
2. `bridge`
3. `sdk`
4. `client`
5. verification and documentation sync

## Pre-Implementation Alignment Check

Before coding, confirm mapping and lifecycle behavior from upstream sources:

- `codex-rs/app-server/README.md` (approval ordering and reasoning deltas)
- `codex-rs/app-server-protocol/src/protocol/v2.rs` (request/decision payload)
- `codex-rs/app-server/tests/suite/v2/request_permissions.rs`
- `codex-rs/app-server/tests/suite/v2/request_user_input.rs`
- `codex-rs/app-server/tests/suite/v2/turn_interrupt.rs`

This check prevents introducing local semantics that drift from app-server.

## Task 1: Extend shared protocol contracts

**Files**

- `packages/protocol/src/index.ts`

**Changes**

1. Expand command approval decision model to represent richer upstream v2
   decisions while preserving existing simple decisions.
2. Extend `PendingCommandRequest` with optional richer context fields:
   - `commandActions`
   - `availableDecisions`
   - `additionalPermissions`
   - `networkApprovalContext`
   - `proposedExecpolicyAmendment`
   - `proposedNetworkPolicyAmendments`
3. Add bridge events for reasoning deltas:
   - summary part boundary
   - summary text delta
   - raw reasoning text delta
4. Keep all new fields optional for backward compatibility.
5. Add protocol-level types for deterministic approval action ordering in UI.

**Output**

- Protocol layer can express richer approval flows and reasoning streaming
  events without breaking current consumers.

## Task 2: Bridge event and request translation

**Files**

- `apps/bridge/src/threads/threadEventTranslator.ts`
- `apps/bridge/src/threads/threadMappers.ts`
- `apps/bridge/src/app-server/types.ts`
- `apps/bridge/src/threadService.ts`

**Changes**

### 2.1 Translate richer approval request payloads

- Parse and normalize richer fields from
  `item/commandExecution/requestApproval`.
- Preserve compatibility for legacy `execCommandApproval` and
  `applyPatchApproval` request methods.

### 2.2 Translate richer command decisions back to app-server

- For v2 command approval requests, emit exact structured decision payloads
  expected by app-server.
- Keep legacy string decision mapping behavior intact.
- Explicitly support:
  - `accept`
  - `acceptForSession`
  - `acceptWithExecpolicyAmendment`
  - `applyNetworkPolicyAmendment`
  - `decline`
  - `cancel`

### 2.3 Translate reasoning delta notifications

Add notification handling for:

- `item/reasoning/summaryPartAdded`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/textDelta`

Emit typed bridge events with thread/turn/item ids and relevant indexes/delta
payload.

### 2.4 Preserve lifecycle ordering semantics

- Keep pending request resolution tied to `serverRequest/resolved` handling.
- Do not introduce optimistic pending-request removal in bridge.
- Keep existing thread-level cleanup (`thread/closed`) for full pending state
  reset when a thread unloads.

**Output**

- Bridge exposes richer approval context and reasoning streaming events through
  typed, compatibility-safe translation.

## Task 3: SDK state merge for reasoning deltas

**Files**

- `packages/sdk/src/threadState.ts`
- `packages/sdk/src/threadRuntime.ts`

**Changes**

1. Extend event reducers to process new reasoning delta bridge events.
2. Implement reasoning item upsert/append logic:
   - create reasoning item if missing when first delta arrives
   - append summary/content in order based on provided indexes
   - preserve summary/content grouping when indexes advance
3. Keep current snapshot merge behavior for `item/started` and
   `item/completed` as authoritative final state.
4. Ensure selected thread detail and pending queued events paths both support
   new events.

**Output**

- Runtime state can show live reasoning updates without regressing existing turn
  and item merge semantics.

## Task 4: Client approval UI parity

**Files**

- `apps/client/src/features/requests/components/pending-request-actions.tsx`
- `apps/client/src/features/requests/components/pending-request-body.tsx`
- `apps/client/src/features/requests/lib/request-utils.ts`
- `apps/client/src/lib/i18n/messages/en.ts`
- `apps/client/src/lib/i18n/messages/zh-CN.ts`

**Changes**

1. Render command action buttons from `availableDecisions` when present.
   - preserve upstream decision order
2. Add explicit cancel action where supported.
3. Render richer command approval context sections:
   - parsed command actions
   - additional permissions summary
   - network approval context
   - proposed policy amendment hints
4. Keep fallback behavior when richer fields are absent by deriving decisions
   from request context (upstream-compatible heuristic).
5. Add i18n entries for new action labels and context descriptions.

**Output**

- Approval UI supports richer upstream semantics without breaking current simple
  flows.

## Task 5: Client reasoning streaming + timing display

**Files**

- `apps/client/src/features/threads/lib/thread-utils.ts`
- `apps/client/src/features/threads/components/thread-detail-messages.tsx`
- optional helper under `apps/client/src/features/threads/components/`
- `apps/client/src/lib/i18n/messages/en.ts`
- `apps/client/src/lib/i18n/messages/zh-CN.ts`

**Changes**

1. Extend flattened item metadata (or equivalent view model) so reasoning
   blocks can access turn-level timing (`startedAt`, `completedAt`, `durationMs`).
2. Update `ThinkingBlock` to support incremental content updates naturally from
   sdk state.
3. Add timing labels:
   - canonical turn duration when available
   - optional live elapsed hint while turn is active (derived locally)
4. Ensure copy clearly distinguishes derived live timing from persisted
   canonical timing.
5. Do not display a fabricated reasoning-item duration as canonical data.

**Output**

- Thread detail presents live reasoning progression with clear timing cues.

## Task 6: Regression checks and consistency pass

**Checks**

- `pnpm --filter @my-codex-app/protocol build`
- `pnpm --filter @my-codex-app/sdk build`
- `pnpm --filter @my-codex-app/bridge build`
- `pnpm --filter @my-codex-app/client build`
- `pnpm typecheck`
- `pnpm fmt:check` (or `pnpm fmt` if formatting changes are needed)

**Focused automated checks**

- Bridge translator tests:
  - command approval request parsing (rich fields)
  - command decision mapping (v2 + legacy)
  - reasoning delta notification translation
- SDK reducer tests:
  - reasoning summary/content delta merge
  - ordering behavior with mixed item snapshot + delta events

**Manual sanity checks**

1. Start a turn that triggers command approval with richer decision/context.
2. Verify request card displays richer context and dynamic actions.
3. Approve, decline, cancel, and richer decision variants where available;
   verify request removal occurs only after `serverRequest/resolved`.
4. Start a turn producing reasoning deltas; verify thinking block updates
   incrementally.
5. Verify timing display behavior for active and completed turns.
6. Verify `thread/closed` still clears stale pending requests for unloaded
   threads.

## Rollout / Safety Notes

- Keep new protocol fields optional and additive.
- Preserve legacy request method support during the transition window.
- If any richer decision mapping is uncertain for a request type, fail with a
  clear bridge error rather than sending ambiguous payloads.

## Suggested Implementation Order (Single PR)

1. Task 1 (`protocol`)
2. Task 2 (`bridge`)
3. Task 3 (`sdk`)
4. Task 4 + Task 5 (`client`)
5. Task 6 (verification)

## Definition of Done

- Spec acceptance criteria are met end-to-end.
- No type errors across protocol/bridge/sdk/client.
- Approval flows remain stable for both v2 and legacy requests.
- Reasoning streaming and timing display are usable on desktop and mobile
  thread detail.
