# Client Modular Refactor Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-13-client-modular-refactor.md`

It remains aligned with the current client architecture and feature behavior
defined in:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-12-client-ui-refactor.md`
- `docs/specs/2026-04-12-thread-chat-flow.md`
- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`

This plan is intentionally client-only unless a small type-only adjustment is
required to keep the refactor buildable.

## Implementation Strategy

This is an in-place refactor of `apps/client/src`.

The refactor should preserve current behavior while changing the internal
composition model. The work should proceed in small, buildable slices so the
application never sits in a long-lived broken intermediate state.

The highest-priority success conditions are:

1. remove oversized mixed-responsibility files
2. establish clearer feature ownership
3. preserve current thread/request/workspace/composer flows
4. keep all changed files type-safe and reviewable

## Target File Ownership

## `app/`

Keep focused on:

- route composition
- layout composition
- page-level controller wiring

Push out of `app/`:

- request-kind rendering
- message item rendering
- thread/workspace formatting helpers
- bulky mutation helpers when they can live in feature-local controller modules

## `features/threads/`

Primary home for:

- thread list UI
- thread detail UI
- thread item renderers
- thread composer
- workspace browser UI/controller
- thread-specific hooks and helpers

## `features/requests/`

Primary home for:

- pending request UI
- request response UI by request kind
- request draft state helpers
- request display helpers

## `components/common/`

Retain only for genuinely cross-domain renderers, such as:

- markdown content
- code block
- terminal output
- app-wide chrome elements already used across domains

## Migration Rule For Existing `components/threads` And `components/requests`

For each existing file under those directories:

- keep it only if it remains a thin, stable, reused building block
- otherwise move its responsibility under the owning feature
- delete compatibility wrappers once call sites are updated

The end state should not leave two competing homes for the same thread/request
business UI.

## Phase 1: Consolidate Feature Ownership

**Goal:** make `features/threads` and `features/requests` the clear home for
domain UI before breaking apart hotspot files.

### Tasks

- inventory current imports and duplicated abstractions
- decide whether each existing `components/threads/*` and
  `components/requests/*` file should be:
  - reused in place
  - moved into `features/*`
  - replaced and removed
- update imports toward the chosen ownership model

### Expected outcome

- a single clear composition path for thread UI
- a single clear composition path for request UI
- less confusion before deeper extraction starts

## Phase 2: Refactor Thread Detail Into Stable Submodules

**Goal:** reduce `thread-detail-panel.tsx` from a page-monolith into a composed
set of smaller modules.

### Proposed split

- `thread-detail-panel.tsx`
  - keep as shell only
  - idle/loading/error/ready branching
  - high-level composition
- `thread-detail-header.tsx`
  - title, status, cwd/workspace display, header actions
- `thread-message-stream.tsx`
  - flattened stream container
  - delegates to item renderer mapping
- `thread-item-renderers.tsx`
  - `FlatItemRenderer`
  - user / agent / reasoning / command / file-change / fallback blocks
- `thread-composer.tsx`
  - textarea, send/stop, settings sheet, model loading, context usage
- `thread-detail-banner.tsx` or small helper module
  - connection banner calculation
- `thread-detail-utils.ts`
  - file-path parsing, command display helpers, markdown/content heuristics

### Notes

- preserve existing lazy-loading of markdown/code/terminal renderers
- preserve request highlight behavior
- preserve workspace browser open behavior from file-path clicks
- keep composer settings reset semantics unchanged

## Phase 3: Refactor Requests Domain

**Goal:** break request rendering into explicit, maintainable parts.

### Proposed split

- `pending-request-list.tsx`
  - list iteration only
- `pending-request-card.tsx`
  - card shell, thread context, timestamp, request title
- `pending-request-body.tsx`
  - per-request-kind body renderer
- `pending-request-actions.tsx`
  - per-request-kind action renderer
- optional `pending-user-input-actions.tsx`
  - question inputs and submit handling for `userInput`

### Notes

- keep `use-request-drafts` as the draft-state authority unless a small local
  refactor is needed
- preserve `RequestRespondRequest` contract and current async response flow
- avoid introducing hidden form state outside the requests domain

## Phase 4: Refactor Workspace Browser

**Goal:** separate workspace browser state management from presentation.

### Proposed split

- `workspace-browser-sheet.tsx`
  - sheet shell and top-level orchestration only
- `use-workspace-browser.ts`
  - directory state
  - expansion state
  - selected file state
  - file preview loading
  - requested-path synchronization
- `workspace-browser-tree-pane.tsx`
  - tree rendering and empty/error/loading states
- `workspace-browser-preview-pane.tsx`
  - preview rendering and mobile back behavior

### Notes

- preserve lazy directory expansion
- preserve mobile `files` / `preview` drill-in model
- preserve request-key driven reopening behavior

## Phase 5: Refactor Thread List And Layout Controller

**Goal:** shrink thread list and route/layout orchestration files.

### Thread list work

- extract stable list UI units if still inlined
- use existing abstractions only if they fit the feature-owned structure
- keep search/filter/grouping logic explicit and local

### Layout controller work

- keep `threads-layout.tsx` focused on:
  - route param resolution
  - responsive branch selection
  - wiring feature containers
- extract runtime action wrappers and repeated error handling into small
  controller helpers or hooks where helpful

### Notes

- preserve mobile panel state machine
- preserve desktop route-driven selection behavior
- preserve current toast/error messaging semantics

## Phase 6: Cleanup And Verification

**Goal:** remove dead wrappers, confirm architectural consistency, and verify
the refactor.

### Cleanup tasks

- remove obsolete wrappers and unused files
- update imports after the final module layout stabilizes
- ensure no hotspot file still exceeds 1000 lines
- review docs consistency with the implemented structure

### Verification tasks

- run `pnpm --filter @my-codex-app/client typecheck`
- run focused lint checks if touched files are covered and lint is practical
- review changed files for:
  - consistent feature ownership
  - explicit state flow
  - absence of accidental behavior drift

## Risks And Mitigations

### Risk: breaking subtle thread-detail interactions

Mitigation:

- keep thread-detail behavior stable while extracting one responsibility at a
  time
- avoid rewriting item render logic while moving it

### Risk: preserving duplicate abstractions by accident

Mitigation:

- treat feature ownership as an explicit refactor goal
- delete or inline obsolete wrappers once replacements are proven

### Risk: over-fragmentation

Mitigation:

- extract only stable responsibility boundaries
- avoid creating tiny one-off files with no clear reuse or ownership

## Deliverable Criteria

The refactor is complete when all of the following are true:

- `apps/client/src` has no source file over 1000 lines
- thread detail, requests, workspace browser, and thread list no longer depend
  on monolithic mixed-responsibility files
- thread and request business UI ownership is clear and documented by the new
  structure
- `apps/client` type checking passes
- the changed files are self-consistent with the spec and existing client docs
