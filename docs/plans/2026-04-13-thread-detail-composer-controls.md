# Thread Detail Composer Controls — Implementation Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-13-thread-detail-composer-controls.md`

It extends the existing thread detail chat flow with typed runtime controls for:

- model selection
- reasoning effort selection
- permission preset selection
- context window usage display

## Implementation Strategy

Deliver the feature in four layers from data to UI:

1. Extend shared protocol types.
2. Add bridge support for settings, models, and context usage.
3. Thread the new state through the SDK runtime.
4. Redesign the composer UI and wire it to real bridge data.

This sequencing keeps the client from rendering placeholder controls that are
not backed by real thread state.

## Task Breakdown

### Task 1: Extend protocol contracts

**Files**

- `packages/protocol/src/index.ts`

**Changes**

- Add typed enums / shapes for:
  - reasoning effort
  - permission preset id
  - thread settings
  - model list results
  - token usage breakdown
  - thread context usage
- Extend:
  - `ThreadDetail`
  - `ThreadReadResponse`
  - `ThreadStartResponse`
  - `TurnStartRequest`
  - `TurnStartResponse`
  - `BridgeEvent`

**Notes**

- Turn-start overrides stay intentionally narrow in this iteration:
  - `model`
  - `reasoningEffort`
  - `permissionsPreset`

### Task 2: Add bridge caches and APIs

**Files**

- `apps/bridge/src/appServerClient.ts`
- `apps/bridge/src/threadService.ts`
- `apps/bridge/src/server.ts`

**Changes**

- Expand app-server response typing for:
  - `thread/start`
  - `thread/resume`
  - `model/list`
  - `thread/tokenUsage/updated`
- Add in-memory caches in `ThreadService`:
  - thread settings by thread id
  - thread context usage by thread id
- Add conversion helpers:
  - app-server settings -> protocol thread settings
  - app-server models -> protocol models
  - app-server token usage -> protocol thread context usage
- Add permission preset mapping:
  - preset id -> app-server `approvalPolicy + sandboxPolicy`
  - raw settings -> derived preset id when possible
- Extend `/api/threads/:id` to return:
  - thread detail
  - last known settings
  - last known context usage
- Add `/api/models` for the client picker
- Emit synthetic bridge events after successful turn settings changes:
  - `threadSettingsUpdated`
- Forward upstream `thread/tokenUsage/updated` as:
  - `threadContextUsageUpdated`

**Behavioral detail**

- If a thread detail read has no cached settings yet, the bridge may perform a
  temporary `thread/resume` to obtain authoritative settings, then unsubscribe
  when that temporary load is not needed for an active subscriber path.

### Task 3: Thread new state through the SDK runtime

**Files**

- `packages/sdk/src/bridgeClient.ts`
- `packages/sdk/src/threadState.ts`
- `packages/sdk/src/threadRuntime.ts`
- `packages/sdk/src/index.ts`

**Changes**

- Add bridge client methods / response typing for model list and richer thread
  detail payloads.
- Update runtime state reducers to preserve:
  - thread settings
  - thread context usage
- Apply new bridge events to selected thread detail snapshots.
- Allow `sendMessage` to accept:
  - text
  - settings draft overrides
- Keep optimistic behavior explicit:
  - preserve text draft on failure
  - update selected thread settings from bridge response / event after success

### Task 4: Redesign the composer UI

**Files**

- `apps/client/src/features/threads/components/thread-detail-panel.tsx`
- `apps/client/src/lib/i18n/messages/en.ts`
- `apps/client/src/lib/i18n/messages/zh-CN.ts`
- optional small helper files under `apps/client/src/features/threads/components/`

**Changes**

- Replace the current one-row composer with:
  - larger textarea area
  - footer controls row
- Add a settings trigger showing the current model name.
- Add a settings popover / menu with sections for:
  - model
  - reasoning effort
  - permission preset
- Add a circular context usage trigger and detail popup.
- Move send / stop action to the footer row right side.
- Keep existing submit semantics:
  - desktop `Enter` submits
  - `Shift+Enter` inserts newline

**UI state**

- Composer keeps a local settings draft synchronized to the selected thread.
- Model choices are fetched from the bridge when needed.
- If the selected model changes, the reasoning effort draft is normalized to a
  supported value for that model.

### Task 5: Validation and review

**Checks**

- `pnpm --filter @my-codex-app/protocol build` if needed by the workspace
- `pnpm --filter @my-codex-app/sdk build`
- `pnpm --filter @my-codex-app/client typecheck`
- `pnpm --filter @my-codex-app/bridge typecheck` or workspace `pnpm typecheck`
  depending on existing scripts

**Manual review**

- Open thread detail on desktop and mobile widths.
- Verify:
  - existing send behavior still works
  - stop behavior still works
  - model picker updates the current thread settings on next send
  - permission preset changes are reflected after send
  - context meter shows unknown state before usage and updates after a completed
    turn

## File-Level Summary

| File                                                                  | Purpose                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/protocol/src/index.ts`                                      | Shared contract additions                                   |
| `apps/bridge/src/appServerClient.ts`                                  | App-server request / response typing                        |
| `apps/bridge/src/threadService.ts`                                    | Settings cache, usage cache, preset mapping, event emission |
| `apps/bridge/src/server.ts`                                           | New client-facing route wiring                              |
| `packages/sdk/src/bridgeClient.ts`                                    | Richer client API methods                                   |
| `packages/sdk/src/threadState.ts`                                     | State reducers for settings and usage                       |
| `packages/sdk/src/threadRuntime.ts`                                   | Send-message overrides and event application                |
| `apps/client/src/features/threads/components/thread-detail-panel.tsx` | Composer UI redesign                                        |
| `apps/client/src/lib/i18n/messages/*.ts`                              | New labels and fallback states                              |

## Risks And Mitigations

- Race between thread detail reads and event-stream resume:
  - Mitigate by letting the bridge obtain authoritative settings when cache is
    empty rather than trusting UI timing.
- Context usage unavailable for historical threads in a fresh bridge process:
  - Mitigate with an explicit unavailable state instead of fake numbers.
- Selected reasoning effort becoming invalid after model switch:
  - Mitigate by normalizing the draft to a supported effort immediately in the
    client.
- Thread settings drift across multiple clients:
  - Mitigate by emitting bridge-level thread settings update events after
    successful override submissions.
