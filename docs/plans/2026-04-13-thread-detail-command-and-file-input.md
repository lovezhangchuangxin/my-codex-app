# Thread Detail Command And File Input — Implementation Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-13-thread-detail-command-and-file-input.md`

It also stays aligned with:

- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`

## Implementation Strategy

Deliver the feature in four layers so each layer stays usable on its own:

1. extend shared protocol contracts
2. add bridge support for command dispatch and workspace file search
3. expose the new bridge surface through the SDK runtime
4. build client-side composer popups and command handling

The client should remain the owner of composer interaction rules, while the
bridge remains the owner of:

- thread-rooted file search
- command requests that map to app-server methods

## Scope Translation

The confirmed MVP command subset is:

- `/compact`
- `/review`
- `/mention`
- `/model`
- `/permissions`

Implementation mapping:

- `/compact` -> bridge -> app-server `thread/compact/start`
- `/review` -> bridge -> app-server `review/start`
- `/mention` -> local composer helper inserting `@`
- `/model` -> local composer helper opening existing settings UI
- `/permissions` -> local composer helper opening existing settings UI

The `@` popup is a bridge-backed workspace file search feature and not an
upstream passthrough.

## Task Breakdown

### Task 1: Extend protocol contracts

**Files**

- `packages/protocol/src/index.ts`

**Changes**

- Add request and response types for:
  - `ThreadCompactRequest`
  - `ThreadCompactResponse`
  - `ThreadReviewRequest`
  - `ThreadReviewResponse`
  - `WorkspaceSearchFilesRequest`
  - `WorkspaceSearchFilesResponse`
  - `WorkspaceSearchMatch`
- Add review enums/types aligned with app-server payload shape:
  - `ReviewTarget`
- Extend `ThreadItem` with explicit item types for:
  - `enteredReviewMode`
  - `exitedReviewMode`
  - `contextCompaction`

**Notes**

- The review target type should stay broader than this slice so future branch or
  commit review work does not need another protocol redesign.
- The client may only expose part of that type initially.

### Task 2: Add bridge app-server methods and mappings

**Files**

- `apps/bridge/src/appServerClient.ts`
- `apps/bridge/src/app-server/types.ts`
- `apps/bridge/src/threads/threadMappers.ts`
- `apps/bridge/src/threadService.ts`
- `apps/bridge/src/server/bridgeServer.ts`

**Changes**

- Add typed app-server request methods for:
  - `thread/compact/start`
  - `review/start`
- Add the corresponding request and response types to
  `apps/bridge/src/app-server/types.ts`.
- Extend thread item mapping so compaction and review lifecycle items are not
  collapsed into `unknown`.
- Add `ThreadService` methods:
  - `compactThread(request)`
  - `startReview(request)`
- Add authenticated HTTP routes:
  - `POST /api/thread/compact`
  - `POST /api/thread/review`

**Behavioral details**

- `compactThread` returns immediately and relies on normal SSE events for
  follow-up state.
- `startReview` returns the started turn plus the review thread id from
  app-server.

### Task 3: Add bridge-owned workspace file search

**Files**

- `packages/protocol/src/index.ts`
- `apps/bridge/src/workspaceService.ts`
- `apps/bridge/src/server/bridgeServer.ts`
- `packages/sdk/src/bridgeClient.ts`

**Changes**

- Add a new bridge API route:
  - `GET /api/workspace/search`
- Implement `WorkspaceService.searchFiles(request)` using the thread workspace
  root already resolved for workspace browsing.
- Search results should:
  - stay inside the resolved thread workspace root
  - return workspace-relative paths only
  - be capped to a small popup-friendly limit
  - prefer likely matches on the typed query

**Implementation note**

- App-server does not currently expose a file-search RPC for this flow, so the
  bridge should implement search locally rather than trying to synthesize it
  from repeated `fs/readDirectory` calls from the browser.
- The smallest coherent implementation is a bridge-local recursive file walk
  with filtering and result limiting.

### Task 4: Expose command and search APIs through the SDK runtime

**Files**

- `packages/sdk/src/bridgeClient.ts`
- `packages/sdk/src/threadRuntime.ts`
- `packages/sdk/src/index.ts` if needed

**Changes**

- Add bridge client methods:
  - `compactThread(request)`
  - `startReview(request)`
  - `searchWorkspaceFiles(request)`
- Add runtime methods:
  - `compactThread(threadId)`
  - `startReview(request)`
- Keep slash-command dispatch in the client layer; the SDK only exposes typed
  actions.

### Task 5: Build client-side composer control layer

**Files**

- `apps/client/src/features/threads/components/thread-detail-composer.tsx`
- optional new helper files under
  `apps/client/src/features/threads/components/` and `lib/`
- `apps/client/src/lib/i18n/messages/en.ts`
- `apps/client/src/lib/i18n/messages/zh-CN.ts`
- `apps/client/src/app/layouts/threads-layout.tsx`

**Changes**

- Add a local composer interaction state machine for:
  - slash popup
  - file popup
  - review target picker
- Detect slash-command context from the first-line `/token`.
- Detect `@token` context around the current caret.
- Add keyboard handling:
  - Up/Down to move popup selection
  - Enter/Tab to accept selection
  - Esc to dismiss
- Add pointer selection for popup items.
- Add command dispatch logic:
  - `/compact` -> runtime action
  - bare `/review` -> open picker
  - `/review <args>` -> runtime review action with custom target
  - `/mention` -> insert `@`
  - `/model` -> open current settings UI
  - `/permissions` -> open current settings UI
- Keep unsupported slash text on the normal plain-text send path.

### Task 6: Review picker UX

**Files**

- likely new client component(s) under
  `apps/client/src/features/threads/components/`

**Changes**

- Bare `/review` opens a lightweight picker with:
  - review uncommitted changes
  - custom review instructions
- Choosing custom instructions opens a small text-entry surface.
- Submitting that surface dispatches `review/start` with a custom target.

### Task 7: Render new thread items cleanly

**Files**

- `apps/client/src/features/threads/components/thread-detail-messages.tsx`

**Changes**

- Render `enteredReviewMode` as a lightweight progress/status block.
- Render `exitedReviewMode` as a review result block using existing markdown or
  plain-text helpers.
- Render `contextCompaction` as a compact system-style activity label.

This keeps `/compact` and `/review` readable in the thread timeline instead of
falling back to raw JSON in the unknown-item renderer.

### Task 8: Validation and review

**Checks**

- `pnpm --filter @my-codex-app/protocol build`
- `pnpm --filter @my-codex-app/sdk build`
- `pnpm --filter @my-codex-app/bridge typecheck`
- `pnpm --filter @my-codex-app/client typecheck`

**Focused manual review**

- plain text send still works
- typing `/` opens the slash popup
- typing `/re` surfaces `/review`
- selecting `/mention` inserts `@`
- typing `@src` surfaces file matches
- selecting a file inserts a relative path
- `/compact` triggers compaction without sending literal slash text
- bare `/review` opens the review target picker
- `/review some instructions` starts a custom review turn
- `/model` and `/permissions` open existing settings UI without losing draft

## File-Level Summary

| File | Purpose |
| --- | --- |
| `packages/protocol/src/index.ts` | shared command/search/review contracts |
| `apps/bridge/src/app-server/types.ts` | app-server request/response typing |
| `apps/bridge/src/appServerClient.ts` | app-server command methods |
| `apps/bridge/src/threads/threadMappers.ts` | compaction/review item mapping |
| `apps/bridge/src/threadService.ts` | bridge command entry points |
| `apps/bridge/src/workspaceService.ts` | thread-rooted workspace search |
| `apps/bridge/src/server/bridgeServer.ts` | HTTP route wiring |
| `packages/sdk/src/bridgeClient.ts` | typed client methods |
| `packages/sdk/src/threadRuntime.ts` | runtime actions for compact/review |
| `apps/client/src/features/threads/components/thread-detail-composer.tsx` | composer popups and command dispatch |
| `apps/client/src/features/threads/components/thread-detail-messages.tsx` | readable review/compaction rendering |
| `apps/client/src/lib/i18n/messages/*.ts` | popup labels, empty states, errors |

## Risks And Mitigations

- Recursive file search can be slow in large repos:
  - mitigate with hard result caps and early-stop traversal once enough matches
    are found
- Slash popup and file popup can fight over the same keystrokes:
  - mitigate with explicit priority rules: active `@token` wins over slash
    popup
- Review picker can sprawl into a larger git feature:
  - mitigate by limiting this slice to uncommitted-changes and custom review
    only
- Review and compaction items can look broken if left as `unknown`:
  - mitigate by adding explicit item types and dedicated rendering now
