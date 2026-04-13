# Client Modular Refactor Spec

## Relationship To Existing Docs

This spec stays aligned with and extends the current client-facing design in:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-12-client-ui-refactor.md`
- `docs/specs/2026-04-12-thread-chat-flow.md`
- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`

This iteration does not change:

- bridge protocol shape
- SDK runtime semantics
- app-server integration behavior
- pairing, session, reconnect, request, or thread lifecycle semantics

The focus is a front-end-only structural refactor of `apps/client` to improve
maintainability, module boundaries, and future extension speed.

## Background

`apps/client` has accumulated several feature additions in a short period:

- mobile-first route and layout rewrite
- continuous thread chat flow
- inline request handling
- workspace browser
- richer composer controls

Those features work together functionally, but they are now concentrated in a
small set of oversized page files. The main problems are:

1. Page-level files mix too many responsibilities.
   `thread-detail-panel.tsx` currently owns screen composition, request wiring,
   workspace navigation, message rendering, composer state, model loading, and
   formatting helpers in one file.
2. Existing abstractions are not consistently used.
   The repository already has `components/threads/*` and `components/requests/*`
   building blocks, but the main feature entry points still inline large
   sections of duplicated presentation logic.
3. Feature boundaries are blurred.
   Some files under `features/*` contain cross-cutting UI concerns, while some
   reusable components under `components/*` are actually business-domain
   specific.
4. Layout/container files are becoming orchestration bottlenecks.
   `threads-layout.tsx` is beginning to absorb runtime actions, route syncing,
   mobile panel state, and toast/error behavior in one place.

The result is that changes are becoming slower, code review cost is rising, and
the risk of accidental regressions increases as new work lands.

## Goals

- Refactor `apps/client` into clearer module boundaries without changing the
  user-visible product model.
- Reduce the size and responsibility load of the current hotspot files.
- Eliminate any single front-end source file in `apps/client/src` exceeding
  1000 lines in this slice.
- Establish a stable layering model so future features can be added without
  recreating page-sized monolith files.
- Keep browser and future Tauri-hosted behavior aligned.
- Preserve type safety and current thread/request/workspace/composer behavior.

## Non-Goals

- Rewriting the visual design system or changing the current UI language.
- Adding new product features or changing scope of existing ones.
- Redesigning bridge APIs, SDK state, or protocol types unless a small typing
  fix is strictly required by the refactor.
- Replacing current routing, auth guard, or runtime bootstrap architecture.
- Forcing every file under an arbitrary line limit when doing so would create
  meaningless indirection. The main target is coherent separation of concerns,
  with the 1000-line cap as an explicit guardrail.

## Scope

### In Scope

- structural refactor of `apps/client/src/app`
- structural refactor of thread-related and request-related UI modules
- extraction of reusable thread detail, thread list, request, and workspace
  browser submodules
- tightening ownership of hooks, presenters, and formatting helpers
- consolidating duplicate UI abstractions already present in the repo
- updating affected documentation to reflect the new front-end module layout

### Out Of Scope

- bridge-side workspace browsing changes
- protocol/schema redesign
- new theme or i18n system work
- test framework migration
- moving client business logic into Tauri-specific runtime code

## Current Architectural Problems

### 1. Large mixed-responsibility feature files

The current hotspot files each span multiple concerns:

- `features/threads/components/thread-detail-panel.tsx`
  - page state branching
  - header rendering
  - pending request wiring
  - message stream rendering
  - item-type renderers
  - composer form and settings panel
  - model loading
  - context usage display
  - workspace browser coordination
  - file-path parsing and formatting helpers
- `features/requests/components/pending-request-list.tsx`
  - list container
  - request card shell
  - request body rendering per kind
  - response action rendering per kind
  - user-input draft handling contract
- `features/threads/components/thread-list-panel.tsx`
  - search and filter state
  - status tabs
  - workspace grouping
  - thread card UI
  - menu actions
- `features/threads/components/workspace-browser-sheet.tsx`
  - sheet layout
  - workspace tree state
  - directory data fetching
  - file preview loading
  - mobile drill-in navigation

### 2. Two competing composition layers

The codebase currently has both:

- domain-specific UI under `features/*`
- partially overlapping domain-specific UI under `components/threads/*` and
  `components/requests/*`

This creates duplication and makes ownership unclear. A future contributor
cannot easily tell whether a thread-domain component should live under
`features/threads` or `components/threads`.

### 3. Container logic not clearly separated from presentational logic

UI composition, runtime actions, client fetch effects, and formatting helpers
are often colocated in the same file even when their lifecycles differ.

## Target Architecture

## Layering Rules

`apps/client` should follow this structure after the refactor:

### `app/`

Responsibilities:

- route declarations
- route/layout composition
- page-level controller wiring

Rules:

- no large item renderers
- no domain formatting helpers
- no request-kind specific UI

### `features/<domain>/`

Responsibilities:

- domain-specific containers
- domain hooks
- domain view models / selectors / formatting helpers
- domain subcomponents that are not truly shared across unrelated domains

Rules:

- feature modules are the primary home for thread and request business UI
- cross-file cohesion matters more than maximizing reuse
- components here may depend on domain types and runtime contracts

### `components/ui/`

Responsibilities:

- headless or style-only primitives

Rules:

- no business-domain knowledge

### `components/common/`

Responsibilities:

- limited truly cross-domain display helpers such as markdown, code, terminal,
  or generic app-level chrome

Rules:

- avoid placing thread-domain or request-domain orchestration here

## Domain Ownership Direction

The thread and request domains should be consolidated under `features/*` as the
single business-UI authority. Existing files under `components/threads/*` and
`components/requests/*` should be handled case by case:

- keep and reuse them if they become thin wrappers aligned with feature-owned
  composition
- move them under `features/*` if they are domain-specific and used only there
- delete or replace them if they are duplicate abstractions no longer needed

The end state should not preserve two parallel homes for the same thread/request
UI patterns.

## Module Responsibilities

### Threads Domain

The threads domain should be split into smaller modules with explicit ownership:

- thread layout controller
  - route param resolution
  - mobile/desktop selection rules
  - runtime actions delegated through small handlers
- thread list view
  - filter controls
  - workspace grouping
  - thread card rendering
- thread detail shell
  - idle/loading/error/ready branching
  - detail-page composition only
- thread detail header
  - title, status, workspace context, header actions
- thread message stream
  - flattened item list rendering
  - item-type dispatch only
- thread item renderers
  - user message
  - agent message
  - reasoning
  - command execution
  - file change
  - user input / mention / image / fallback blocks
- thread composer
  - text draft
  - submit and interrupt controls
  - model/settings sheet
  - context usage trigger
- workspace browser controller
  - directory fetch state
  - file preview fetch state
  - open-request synchronization
  - desktop/mobile presentation switching

### Requests Domain

The requests domain should separate:

- request list shell
- request card container
- request body renderers per request kind
- request action renderers per request kind
- user-input answer draft hook/state utilities

The goal is to keep request-specific decision handling explicit while preventing
the list component from owning every possible request rendering detail.

### Runtime Integration

Runtime-facing logic in the client should remain explicit and typed, but it
should be pushed closer to small controller layers:

- `RuntimeProvider` continues to own runtime lifecycle bootstrap/dispose
- route/layout containers coordinate runtime actions
- leaf presentation components should receive typed props rather than directly
  performing unrelated runtime orchestration whenever practical

This is not a push for global state libraries or hidden side effects. The target
is explicit prop flow with smaller controllers.

## Refactor Principles

### Principle 1: Split by responsibility, not by JSX volume alone

A file should be extracted because it owns a stable concept, not because the
current file is long.

### Principle 2: Prefer feature-local cohesion over artificial global reuse

If a component is only meaningful inside the threads or requests domain, it
should live there even if it is reused by multiple files in the same feature.

### Principle 3: Keep state close to the smallest practical controller

Examples:

- message composer draft belongs with the composer controller, not the route
- workspace browser fetch state belongs with the workspace browser controller,
  not the thread detail page shell
- request answer drafts belong with the request handling flow, not generic app
  state

### Principle 4: Preserve current behavior while improving structure

This slice is a refactor milestone. Behavior drift should be treated as a
regression unless explicitly documented and approved.

## Acceptance Criteria

- No source file under `apps/client/src` exceeds 1000 lines after the refactor.
- The current hotspot modules are broken into smaller, named responsibilities.
- Thread-domain and request-domain business UI no longer live across two
  competing directory structures without a clear rule.
- `threads-layout` no longer acts as an oversized mixed UI/action container.
- Existing user flows continue to work:
  - pairing gate remains unchanged
  - thread list browsing remains unchanged
  - thread detail viewing remains unchanged
  - sending messages and interrupting turns remain unchanged
  - pending request handling remains unchanged
  - workspace browser remains unchanged
  - composer controls remain unchanged
- TypeScript type checking continues to pass.

## Risks And Constraints

### Refactor regression risk

Moving renderers and controllers across files can break subtle prop contracts,
especially around:

- request highlight navigation
- mobile thread switching
- workspace browser requested-path opening
- composer settings reset behavior

### Documentation drift risk

The repository already contains multiple client-facing specs. The refactor must
not silently create a new front-end architecture that conflicts with those
documents.

### Over-abstraction risk

The refactor should not create a maze of tiny files with weak ownership. The
goal is stronger boundaries and maintainability, not maximum fragmentation.

## Validation Requirements

At minimum, this refactor must preserve:

- type correctness
- current route behavior
- request/schema consistency at the client boundary
- documentation consistency for the front-end module layout

Focused verification should include:

- `apps/client` type checking
- relevant linting if the touched files are covered
- review of the new module boundaries against this spec and the existing client
  specs
