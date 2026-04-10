# Client Frontend Rebuild Technical Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-10-client-frontend-rebuild.md`

It also stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/plans/2026-04-10-codex-mobile-web-platform.md`

## Implementation Strategy

The rebuild should preserve the existing bridge and SDK integration surface while
replacing the current prototype app shell with a standard, maintainable frontend
application structure.

The work should be treated as a controlled in-place rebuild of `apps/client`, not as
a protocol redesign.

## Current Implementation Snapshot

The plan has now been implemented. The current client structure is:

```text
apps/client/
  components.json
  eslint.config.js
  index.html
  package.json
  tsconfig.app.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  src/
    App.tsx
    main.tsx
    index.css
    app/
      providers.tsx
      router.tsx
      layouts/
        app-shell.tsx
        threads-shell.tsx
    components/
      common/
      ui/
    features/
      connection/
        routes/
      requests/
        components/
        lib/
      threads/
        components/
        lib/
    hooks/
      use-media-query.ts
    lib/
      env.ts
      utils.ts
      runtime/
        runtime-provider.tsx
        use-runtime-snapshot.ts
```

## Guiding Decisions

### Decision 1: Recreate the client from an official Vite scaffold

The final `apps/client` directory should match the structure and conventions of an
official Vite React + TypeScript application, adapted for the monorepo.

Implementation consequence:

- use an official scaffold as the baseline
- replace prototype-specific project files with standard Vite app structure
- remove tracked build artifacts and stop TypeScript from emitting into source paths

### Decision 2: Keep runtime logic in `packages/sdk`

The SDK already owns thread loading, selection, live event merge, and request-response
mutations.

Implementation consequence:

- do not introduce a second transport/state authority
- add a thin client-side provider and hook layer around `BridgeThreadRuntime`
- keep feature code focused on rendering and UI-local state

### Decision 3: Route-first app shell

The rebuilt app should use React Router to represent product surfaces explicitly.

Implementation consequence:

- top-level routes model product sections
- thread detail is route state, not manually encoded query mutation
- desktop split-view and mobile single-view behavior live inside the route shell

### Decision 4: Tailwind + shadcn as the base UI system

Implementation consequence:

- global look-and-feel is defined with theme tokens and Tailwind utilities
- low-level controls are sourced from shadcn CLI-generated components
- custom code focuses on product-specific composition, not primitive reinvention

## Implemented Project Structure

```text
apps/client/
  components.json
  eslint.config.js
  index.html
  package.json
  tsconfig.app.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  src/
    App.tsx
    index.css
    main.tsx
    app/
      providers.tsx
      router.tsx
      layouts/
        app-shell.tsx
        threads-shell.tsx
    components/
      common/
      ui/
    features/
      threads/
        components/
        lib/
      requests/
        components/
        lib/
      connection/
        routes/
    hooks/
      use-media-query.ts
    lib/
      env.ts
      utils.ts
      runtime/
        runtime-provider.tsx
        use-runtime-snapshot.ts
```

This is the structure that now exists in the codebase. It keeps route composition,
feature code, generated UI primitives, and runtime helpers separated without adding
extra abstraction layers that the current bridge/client scope does not need.

## Tooling Changes

## Base scaffold

Recreate the app from the official Vite `react-ts` template and adapt it to the
workspace package name and monorepo dependencies.

Constraints:

- preserve `@my-codex-app/client` package identity
- keep Vite as the app dev/build tool
- keep React 19
- keep workspace dependencies on `@my-codex-app/sdk` and `@my-codex-app/protocol`

## Styling and UI tooling

Add:

- Tailwind CSS
- shadcn initialization metadata
- shadcn CLI-generated components required by the app
- supporting utilities commonly used with shadcn

Expected shadcn component set for the first rebuild slice:

- `button`
- `card`
- `badge`
- `input`
- `textarea`
- `label`
- `separator`
- `scroll-area`
- `sheet`
- `drawer`
- `tabs`
- `accordion`
- `collapsible`
- `alert`
- `alert-dialog`
- `dropdown-menu`
- `tooltip`
- `skeleton`

Additional likely packages:

- `react-router-dom`
- `lucide-react`
- `sonner`

## Runtime Integration Plan

## Runtime provider

Add a dedicated runtime layer under `src/lib/runtime/`:

- `runtime-provider.tsx`
  - creates one `BridgeThreadRuntime`
  - wires bridge URL and token from centralized env helpers
  - handles lifecycle disposal
- `use-runtime-snapshot.ts`
  - exposes `useSyncExternalStore` subscription access
- runtime action hooks or helpers
  - `loadThreads`
  - `selectThread`
  - `startThread`
  - `sendMessage`
  - `interruptTurn`
  - `respondToRequest`

This keeps page components from instantiating SDK objects directly.

## URL and selection behavior

- route params become the primary selected-thread source
- the app should continue reading legacy `?threadId=` on first load and redirect to `/threads/:threadId`
- route navigation should trigger `runtime.selectThread(...)`
- deselect behavior should map to `/threads`

## Feature Module Plan

## `features/threads`

Responsibilities:

- thread list page and split-view shell
- local search/filter state
- thread card rendering
- thread detail route composition
- composer and interrupt actions
- turn timeline rendering
- item-type-specific renderers

Suggested components:

- `thread-list-panel`
- `thread-card`
- `thread-empty-state`
- `thread-detail-header`
- `thread-composer`
- `turn-timeline`
- `turn-card`
- `thread-item-renderer`
- `thread-status-badge`

## `features/requests`

Responsibilities:

- pending request summary rendering
- inline request cards for thread detail
- aggregated inbox rendering
- request action button sets
- user-input draft state helpers

Suggested components:

- `pending-request-list`
- `pending-request-card`
- `command-approval-card`
- `file-change-approval-card`
- `permissions-request-card`
- `user-input-request-card`
- `request-kind-badge`
- `inbox-list`

## `features/connection`

Responsibilities:

- bridge diagnostics route
- local-mode labeling
- health/status summaries
- configuration hints and recovery messaging

Suggested components:

- `connection-status-card`
- `bridge-config-card`
- `health-check-card`
- `recovery-help`

## Layout Plan

## Top-level app shell

`app-shell.tsx` should provide:

- branded header or side rail
- top-level navigation
- shared shell spacing and background treatment
- mobile bottom navigation
- content slot for route views

## Threads shell

`threads-shell.tsx` should provide responsive route-aware behavior:

- mobile:
  - `/threads` shows list only
  - `/threads/:threadId` shows detail only
- desktop:
  - `/threads` and `/threads/:threadId` render split view
  - list stays visible while detail updates on the right

## Styling Plan

## Global styles

The rebuild replaced the old monolithic `src/styles.css` with `src/index.css`,
containing:

- Tailwind base/theme layers
- CSS variables for semantic colors, spacing accents, radius, and shadows
- font-face/import strategy for the chosen type system
- minimal global resets only

## Visual direction

Adopt a product look centered on:

- editorial/terminal-inspired typography
- warm neutral surfaces with strong content contrast
- clear status colors for active, idle, blocked, and error states
- distinct presentation for assistant output, reasoning, commands, and diffs

The design should remain restrained enough for long session monitoring without
becoming a generic admin dashboard.

## Migration Plan

### Phase 1: Normalize the app scaffold

- create the official Vite React + TypeScript baseline
- port package metadata into the monorepo context
- fix TypeScript project configuration
- add Tailwind and shadcn initialization
- remove tracked build artifacts and obsolete prototype files

### Phase 2: Establish app shell and routing

- add React Router
- add top-level shell layouts
- implement route structure
- implement legacy `threadId` query compatibility redirect

### Phase 3: Rebuild runtime-facing feature composition

- add runtime provider/hooks
- reconnect thread list and thread detail to SDK snapshot state
- preserve existing mutations through the new action layer

### Phase 4: Rebuild page surfaces

- rebuild Threads page
- rebuild Thread Detail page
- rebuild Inbox page
- rebuild Connection page

### Phase 5: Polish responsive and interaction behavior

- mobile navigation and safe-area handling
- pinned composer behavior
- loading, empty, and error states
- visual consistency and spacing refinement

### Phase 6: Validate and review

- typecheck
- lint
- build
- review route behavior
- review pending-request behavior
- review desktop/mobile layout behavior

## Data And State Details

## Thread list filtering

Local filter state should not change bridge protocol. Filtering will operate on the
already loaded thread summaries from the runtime snapshot.

Initial filter dimensions:

- search term
- status group

The grouping by workspace/project name should be derived from `cwd` on the client.

## Pending request aggregation

`Inbox` should derive from `snapshot.threads` when the thread list is ready:

- flatten all thread summary `pendingRequests`
- join each request with the owning thread summary
- sort by `requestedAt` descending

The inbox remains a derived client view and does not require a new bridge endpoint.

## Mutation UX

All primary actions should reflect runtime mutation state:

- new thread pending
- send message pending
- interrupt pending
- request response pending by request id
- last mutation error

UI should disable duplicate actions while a matching mutation is in flight.

## Compatibility Notes

- The current bridge only supports local bootstrap token auth and `/healthz`.
- The connection page must not depend on unimplemented bridge APIs.
- The route structure should leave room for future pairing and relay flows without
  forcing another shell rewrite.
- The SDK and protocol packages remain source-compatible during this client rebuild.

## Validation Plan

Minimum validation for this rebuild:

- `pnpm --filter @my-codex-app/client typecheck`
- `pnpm --filter @my-codex-app/client build`

Manual verification checklist:

- app boots with valid bridge env
- thread list loads
- selecting a thread loads detail
- sending a message still works
- interrupting an active turn still works
- pending requests render in thread detail
- inbox shows aggregated pending requests
- connection page shows meaningful diagnostics
- mobile viewport layout remains usable
- desktop split-view layout remains usable

## Risks

### Risk 1: Rebuild churn obscures functional regressions

Mitigation:

- keep SDK integration stable
- rebuild in layers
- validate key actions after each major surface is restored

### Risk 2: shadcn/Tailwind adoption balloons scope

Mitigation:

- limit first-pass component set to what the app actually needs
- avoid introducing unrelated visual abstraction work

### Risk 3: Mobile and desktop behavior diverge

Mitigation:

- define route and shell behavior explicitly
- build mobile-first layouts and add desktop split-view intentionally

### Risk 4: Connection/settings UI overpromises unsupported bridge features

Mitigation:

- keep the connection page strictly diagnostic for the current bridge
- reserve future sections without inventing fake API-backed flows
