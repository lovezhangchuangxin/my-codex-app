# Project-Centered Threads Home Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-13-project-centered-threads-home.md`

It also stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-13-client-modular-refactor.md`

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- the work crosses protocol, bridge, SDK, and client layers
- the highest-risk parts are data-shape alignment and route-state integration
- the client layout and bridge registry behavior are tightly coupled

The implementation should stay buildable at each phase and avoid a large
all-at-once UI rewrite.

## Design Summary

The recommended implementation shape is:

1. add a bridge-authoritative project registry and unified project-list API
2. extend client-facing `thread/list` with `cwd` filtering
3. keep the existing thread runtime responsible for connection state, selected
   thread detail, and cross-thread pending state
4. build the new project-first `/threads` page as a client feature layer using
   `useBridgeClient()` for project queries and filtered session queries
5. reuse the existing thread detail panel once a session is selected

This deliberately avoids a large `packages/sdk` runtime redesign in the first
slice. The new project home is product-critical, but it does not need to become
part of the current SSE-driven thread runtime snapshot immediately.

## Phase 1: Documentation And Contract Alignment

**Goal:** Establish the new product model and remove ambiguity with the older
thread-first `/threads` definition.

Changes:

- add the new project-centered spec and plan
- mark the older client UI refactor spec and plan as historical for `/threads`
  information architecture
- keep the existing thread detail, request, and settings docs intact

Validation after phase:

- docs read consistently
- no two active docs define conflicting `/threads` page hierarchies

## Phase 2: Protocol Additions

**Goal:** Add the minimum typed surface needed for projects and project-scoped
session browsing.

### `packages/protocol/src/index.ts`

Add project-facing types, for example:

- `ProjectSummary`
- `ProjectListResponse`
- `ProjectSearchRequest`
- `ProjectSearchResponse`
- `ProjectSearchEntry`
- `ProjectImportRequest`
- `ProjectImportResponse`

Recommended `ProjectSummary` shape:

```ts
type ProjectSummary = {
  path: string;
  displayName: string;
  imported: boolean;
  hasDerivedThreads: boolean;
  sessionCount: number;
  pendingRequestCount: number;
  hasActiveSession: boolean;
  lastActiveAt?: number;
  available: boolean;
};
```

Extend the existing thread list contract:

- add `cwd?: string` to `ThreadListRequest`

Design rules:

- project identity is the bridge-returned canonical path
- `displayName` is presentation-only
- project list aggregates imported state and derived thread state
- session filtering remains thread-based through `cwd`

## Phase 3: Bridge Project Registry And Session Filtering

**Goal:** Make the bridge the authority for imported projects and unified
project summaries.

### New bridge state

Add a bridge-managed project registry store. Recommended layout:

- `apps/bridge/src/projects/projectRegistryStore.ts`

Responsibilities:

- load and save imported projects from a versioned local JSON file
- preserve imported projects even when they have zero sessions
- store canonical project paths and import timestamps

Recommended config addition:

- `bridgeProjectStatePath`

Default:

- a file adjacent to the existing bridge auth state under `.local/`

Use a separate file from auth state so project registry evolution does not
couple to token and device persistence.

### New service layer

Add a bridge service for project operations. Recommended file:

- `apps/bridge/src/projectService.ts`

Responsibilities:

- import a project path after canonicalization and directory validation
- merge imported projects with thread-derived projects
- compute project summaries from thread summaries
- search known projects by path or display name
- provide bounded path suggestions for typed path prefixes

Project merge rules:

- imported and derived records with the same canonical path collapse to one
  summary
- imported projects with zero sessions still appear
- if an imported project later has sessions, it remains one summary with both
  flags

### Thread filtering support

Extend:

- `apps/bridge/src/threadService.ts`
- `apps/bridge/src/appServerClient.ts`
- `apps/bridge/src/server/bridgeServer.ts`

Changes:

- thread listing must pass the optional `cwd` filter through to upstream
  `thread/list`
- `GET /api/threads` must accept `cwd`

### Bridge routes

Add authenticated routes:

- `GET /api/projects`
- `GET /api/projects/search`
- `POST /api/projects/import`

Recommended query behavior for search:

- known-project substring matching
- bounded path-prefix suggestion based on the nearest existing parent directory
- directory-only results

Do not implement unbounded recursive filesystem search.

Validation after phase:

- `pnpm --filter @my-codex-app/protocol typecheck`
- `pnpm --filter @my-codex-app/bridge typecheck`

## Phase 4: SDK Client Surface

**Goal:** Expose project APIs and filtered session listing to the browser client.

### `packages/sdk/src/bridgeClient.ts`

Add:

- `listProjects()`
- `searchProjects(request)`
- `importProject(request)`

Update:

- `listThreads(request)` to include optional `cwd`

This phase does not require a new SDK runtime snapshot shape. The bridge client
methods are enough for the first project-home slice.

Validation after phase:

- `pnpm --filter @my-codex-app/sdk typecheck`
- `pnpm --filter @my-codex-app/client typecheck`

## Phase 5: Client Project Domain

**Goal:** Build a project-first `/threads` page without destabilizing the
existing thread runtime.

### New client feature area

Add a dedicated projects feature. Recommended files:

- `apps/client/src/features/projects/components/projects-panel.tsx`
- `apps/client/src/features/projects/components/project-card.tsx`
- `apps/client/src/features/projects/components/project-sessions-panel.tsx`
- `apps/client/src/features/projects/components/project-import-sheet.tsx`
- `apps/client/src/features/projects/lib/project-utils.ts`
- `apps/client/src/features/projects/hooks/use-project-home.ts`

Responsibilities:

- fetch and present project summaries
- manage selected project UI state
- fetch project-scoped sessions through `listThreads({ cwd })`
- manage import modal state and path search UX
- keep project-home state local to the feature

### Controller wiring

Refactor `apps/client/src/app/layouts/threads-layout.tsx` so it becomes a
project-centered controller.

Required behavior:

- mobile state machine:
  - `projects`
  - `projectSessions`
  - `threadDetail`
- desktop three-column layout:
  - projects
  - sessions
  - thread detail

Existing runtime responsibilities stay in place:

- `useRuntime()` for `selectThread`, `startThread`, `sendMessage`, `interrupt`,
  `respondToRequest`, and detail rendering
- `useRuntimeSnapshot()` for connection state, selected thread detail, and
  cross-thread pending indicators
- `useBridgeClient()` for project list, project search, project import, and
  project-scoped session listing

### Route to project-context resolution

Deep links to `/threads/:threadId` still need project context.

Required behavior:

- when entering via a thread route, resolve that thread's `cwd`
- select the matching project in the projects column or mobile projects flow
- select the matching session in the sessions column
- keep thread detail route behavior unchanged

### New session creation

The primary action in the sessions view must call:

- `runtime.startThread({ cwd: selectedProject.path })`

On success:

- refresh the selected project's session list
- navigate into the created session detail

### Empty and error states

The client must distinguish:

- no projects yet
- imported project with zero sessions
- invalid or unavailable imported project
- project-search validation errors

Validation after phase:

- `pnpm --filter @my-codex-app/client typecheck`

## Phase 6: Polish And Consistency Review

**Goal:** Align the new project model with the existing app chrome and request
surfaces.

Checklist:

- ensure the header, request sheet, and settings sheet still work from all
  project-home states
- ensure pending request counts shown on project cards match thread-derived
  counts
- ensure mobile back navigation feels linear and predictable
- ensure desktop still behaves reasonably when no project or no thread is
  selected
- ensure imported projects without sessions remain visible after reconnect

## Suggested Implementation Order

1. Add the new spec and plan docs.
2. Add protocol project types and `ThreadListRequest.cwd`.
3. Implement bridge project registry persistence and project service.
4. Add bridge project routes and thread-list `cwd` filtering.
5. Extend `BridgeClient` with project APIs.
6. Build the projects feature state and views in `apps/client`.
7. Refactor `threads-layout.tsx` into project-first mobile and desktop flows.
8. Wire deep-link-to-project resolution and project-scoped session creation.
9. Run focused typechecks and do final doc and UX consistency review.

## Verification Plan

Minimum required verification:

- `pnpm --filter @my-codex-app/protocol typecheck`
- `pnpm --filter @my-codex-app/sdk typecheck`
- `pnpm --filter @my-codex-app/bridge typecheck`
- `pnpm --filter @my-codex-app/client typecheck`

Manual verification checklist:

- mobile landing state shows projects, not a flat thread list
- importing a valid project by path succeeds
- importing an invalid path shows a validation error
- imported zero-session projects remain visible after refresh
- selecting a project only shows that project's sessions
- starting a new session in a selected project uses that project's path
- deep-linking to `/threads/:threadId` resolves the surrounding project and
  session context

## Risks And Mitigations

### Risk: project identity drift between imported paths and thread `cwd`

Imported projects are canonicalized at import time, while thread `cwd` values
come from historical session state and may include symlinked or non-canonical
paths.

Mitigation:

- canonicalize imported paths
- attempt best-effort canonicalization for thread-derived paths when building
  project summaries
- fall back to the original absolute path if canonicalization fails

### Risk: large client runtime rewrite slows delivery

Trying to fold projects into the existing thread runtime snapshot immediately
would expand the blast radius.

Mitigation:

- keep projects as a feature-local client state in the first slice
- preserve the existing thread runtime for connection and detail semantics

### Risk: path search becomes an accidental filesystem crawler

An unbounded search implementation would create performance and security
problems.

Mitigation:

- limit search to known projects plus bounded path-prefix suggestions
- do not implement recursive full-disk search in this slice

### Risk: imported-project persistence gets coupled to auth-state migration

Reusing the auth-state file directly would make unrelated schema evolution
harder.

Mitigation:

- store imported projects in a separate versioned bridge state file
