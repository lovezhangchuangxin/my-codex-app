# Thread Detail Session Commands — Implementation Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-13-thread-detail-session-commands.md`

It also stays aligned with:

- `docs/specs/2026-04-13-project-centered-threads-home.md`
- `docs/specs/2026-04-13-thread-detail-command-and-file-input.md`

## Implementation Strategy

Deliver the feature in four layers:

1. extend shared protocol and bridge event contracts
2. add bridge + SDK rename support
3. extract reusable thread-switcher UI and wire project-scoped session actions
4. expand client slash command handling for the new session commands

This keeps `/rename` aligned with upstream app-server semantics while letting
`/new`, `/clear`, and `/resume` stay client-controlled actions.

## Scope Translation

Confirmed Web command behavior:

- `/rename`
  - bare command opens a rename sheet
  - inline args dispatch rename immediately
- `/new`
  - start a new thread with `cwd = currentThread.cwd`
- `/clear`
  - alias of `/new`
- `/resume`
  - open the existing current-project thread switcher sheet

Explicitly out of scope in this slice:

- `/resume <id-or-name>`
- global all-thread resume picker
- terminal clearing semantics

## Task Breakdown

### Task 1: Extend protocol contracts

**Files**

- `packages/protocol/src/index.ts`

**Changes**

- Add:
  - `ThreadRenameRequest`
  - `ThreadRenameResponse`
- Extend `BridgeEvent` with:
  - `threadNameUpdated`

### Task 2: Add bridge rename support

**Files**

- `apps/bridge/src/app-server/types.ts`
- `apps/bridge/src/appServerClient.ts`
- `apps/bridge/src/threadService.ts`
- `apps/bridge/src/server/bridgeServer.ts`
- `apps/bridge/src/threads/threadEventTranslator.ts`

**Changes**

- Add app-server request typing for:
  - `thread/name/set`
- Add `AppServerClient.setThreadName(...)`
- Add `ThreadService.renameThread(...)`
- Add `POST /api/threads/rename`
- Translate upstream `thread/name/updated` notification into the typed bridge
  event

### Task 3: Thread rename state through the SDK runtime

**Files**

- `packages/sdk/src/bridgeClient.ts`
- `packages/sdk/src/threadRuntime.ts`
- `packages/sdk/src/threadState.ts`

**Changes**

- Add `BridgeClient.renameThread(...)`
- Add `BridgeThreadRuntime.renameThread(...)`
- Update thread-list and selected-thread reducers for `threadNameUpdated`

### Task 4: Extract reusable thread switcher UI

**Files**

- `apps/client/src/features/threads/components/thread-detail-header.tsx`
- optional new component under `apps/client/src/features/threads/components/`

**Changes**

- Extract the existing thread switcher sheet into a reusable controlled
  component
- Allow both:
  - the existing header button
  - composer `/resume`
  to open the same sheet

### Task 5: Expand thread detail controller actions

**Files**

- `apps/client/src/app/layouts/threads-layout.tsx`
- `apps/client/src/features/threads/components/thread-detail-panel.tsx`

**Changes**

- Pass current-project new-thread action into thread detail
- Pass runtime rename action into thread detail
- Keep navigation aligned with the existing project-centered route / mobile
  state machine

### Task 6: Expand composer command definitions and dispatch

**Files**

- `apps/client/src/features/threads/lib/composer-command-utils.ts`
- `apps/client/src/features/threads/components/thread-detail-composer.tsx`
- `apps/client/src/lib/i18n/messages/en.ts`
- `apps/client/src/lib/i18n/messages/zh-CN.ts`

**Changes**

- Add supported commands:
  - `rename`
  - `new`
  - `resume`
- Add alias support:
  - `clear -> new`
- Add rename sheet UI state and submission flow
- Dispatch:
  - `/rename` -> open rename sheet
  - `/rename <name>` -> rename runtime action
  - `/new` -> current-project create action
  - `/clear` -> same as `/new`
  - `/resume` -> open thread switcher sheet

## Validation Plan

Run:

- `pnpm --filter @my-codex-app/protocol build`
- `pnpm --filter @my-codex-app/sdk build`
- `pnpm --filter @my-codex-app/bridge typecheck`
- `pnpm --filter @my-codex-app/client typecheck`

Focused manual checks:

- `/rename` opens rename sheet
- `/rename New title` renames the current thread
- current thread title updates in detail and project session list
- `/new` creates a new thread in the current project
- `/clear` behaves the same as `/new`
- `/resume` opens the switch-thread sheet on desktop and mobile
- selecting a thread from the resumed sheet opens the chosen thread
- unsupported slash input still sends as plain text

## Recommended Execution Mode

- `Main agent`

Reason:

- the write scope crosses `protocol`, `bridge`, `sdk`, `client`, and docs
- rename relies on consistent event and reducer wiring
- `/resume` requires coordinated UI extraction rather than isolated file edits
