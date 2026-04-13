# Bridge Modular Refactor Spec

## Background

The `apps/bridge` package has grown into the main local integration surface
between the shared client and upstream `codex app-server`.

Recent milestones added:

- local pairing and device trust
- session refresh and authenticated HTTP + SSE access
- reconnect-oriented thread subscription grace behavior
- workspace directory and file browsing
- thread settings, model listing, and context-usage support

Those capabilities were added incrementally and are currently concentrated in a
small number of large files:

- `apps/bridge/src/threadService.ts`
- `apps/bridge/src/server.ts`
- `apps/bridge/src/appServerClient.ts`

The current issue is not only file length. Core responsibilities are mixed
together, which makes the bridge harder to review, test, extend, and safely
change.

This refactor formalizes the internal module boundaries of `apps/bridge`
without changing the bridge's external product behavior.

## Relationship To Existing Specs

This refactor must remain aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`

It is an internal maintainability milestone for the bridge package. It does not
replace the user-facing behavior defined by those specs.

## Goals

- Reduce single-file size in `apps/bridge`, with no file exceeding 1000 lines.
- Separate bridge responsibilities into clear, typed module boundaries.
- Keep the bridge aligned with upstream `codex app-server` semantics.
- Preserve the existing HTTP + SSE API behavior exposed to clients.
- Make future bridge work easier to extend and easier to validate.

## Non-Goals

- Redesigning the bridge transport away from HTTP + SSE.
- Changing the pairing, device trust, or session-auth product model.
- Changing reconnect and resync behavior beyond internal code organization.
- Introducing a new persistence layer or durable event store.
- Expanding client-facing protocol contracts unless a minimal bridge-internal
  typing fix is required.

## Scope

Included:

- internal directory and module restructuring inside `apps/bridge`
- extraction of bridge-internal helpers, caches, mappers, and route handlers
- reduction of oversized files by moving cohesive logic into focused modules
- preservation of current bridge APIs and app-server integration semantics
- documentation updates for the refactor scope and implementation plan

Excluded:

- feature work in `apps/client`
- new protocol capabilities in `packages/protocol`
- relay work
- behavior changes to workspace browsing, pairing flows, or thread controls

## Current Problems

### Mixed responsibilities in thread orchestration

`threadService.ts` currently combines:

- thread list/read/start/resume/interrupt flows
- thread settings and context-usage caches
- pending request tracking
- command-item merge behavior
- app-server notification to bridge-event translation
- app-server request to pending-request translation
- thread item and user-input mapping
- approval decision remapping

This makes it difficult to reason about which code owns:

- bridge state
- protocol translation
- runtime actions
- request lifecycle handling

### Mixed responsibilities in the HTTP server entrypoint

`server.ts` currently combines:

- process bootstrap
- bridge configuration
- route matching
- request body parsing
- JSON/error response helpers
- auth entry checks
- SSE client management
- thread unsubscribe grace logic

This makes route evolution and server lifecycle changes riskier than necessary.

### Mixed responsibilities in app-server transport code

`appServerClient.ts` currently combines:

- child-process lifecycle
- JSON-RPC request/response transport
- line parsing and event dispatch
- app-server request/result type declarations
- bridge-facing client API methods

This makes the bridge's upstream integration layer broader than needed and
harder to test or extend.

## Upstream Alignment Requirements

This refactor must continue to respect upstream `codex app-server` behavior as
the authority for:

- `initialize` handshake requirements
- `thread/start`
- `thread/resume`
- `thread/unsubscribe`
- turn and item event ordering
- server-initiated approval and user-input requests
- `serverRequest/resolved`
- `thread/tokenUsage/updated`

The bridge may reorganize its internal implementation, but it must not invent a
conflicting thread lifecycle or stronger guarantees than upstream provides.

## Solution Overview

The bridge should be reorganized around a small number of focused internal
areas.

### 1. App-server integration layer

This layer owns:

- spawning and closing `codex app-server`
- JSON-RPC request dispatch
- JSONL message parsing
- notification and request emission
- bridge-local app-server typings

It should present a small facade to bridge services instead of exposing mixed
transport and protocol details everywhere.

### 2. Thread domain layer

This layer owns:

- thread list/read/start/resume/interrupt/respond operations
- bridge-side runtime caches for thread data
- app-server to protocol mapping
- bridge event translation
- pending request lifecycle handling
- permission preset mapping

The goal is to keep thread orchestration explicit while isolating pure mapping
logic from mutable bridge state.

### 3. HTTP server layer

This layer owns:

- bridge bootstrap wiring
- HTTP route handling
- request parsing and response helpers
- auth gate placement
- SSE client registry
- thread subscription grace handling

Route behavior should remain the same, but the main server entry should become a
composition root rather than the place where most business logic lives.

### 4. Existing auth and workspace layers

The existing `auth` and `workspace` logic should continue to exist, but the
server should depend on them through clearer route-level boundaries.

This refactor does not require reworking their product behavior.

## Proposed Module Boundaries

The refactor should move toward a structure similar to:

```text
apps/bridge/src/
  app-server/
    appServerClient.ts
    appServerProcess.ts
    jsonRpcClient.ts
    types.ts
  server/
    bridgeServer.ts
    config.ts
    errors.ts
    responses.ts
    routes/
      authRoutes.ts
      deviceRoutes.ts
      eventRoutes.ts
      threadRoutes.ts
      workspaceRoutes.ts
    sse/
      threadEventStreamRegistry.ts
  threads/
    threadService.ts
    threadRuntimeCache.ts
    threadEventTranslator.ts
    threadMappers.ts
    permissionPresets.ts
    pendingRequests.ts
  auth/
  workspace/
```

Exact file names may vary during implementation, but the responsibilities above
should be preserved.

## Design Requirements

### API compatibility

The following routes and their behavior must remain compatible for current
clients:

- `GET /healthz`
- `GET /api/pairing`
- `POST /api/pairing/complete`
- `POST /api/session/refresh`
- `GET /api/devices`
- `POST /api/devices/revoke`
- `POST /api/devices/delete`
- `GET /api/threads`
- `GET /api/threads/:id`
- `POST /api/threads/start`
- `GET /api/models`
- `GET /api/workspace/directory`
- `GET /api/workspace/file`
- `GET /api/events`
- `POST /api/turns/start`
- `POST /api/turns/interrupt`
- `POST /api/requests/respond`

### State ownership

Bridge-local mutable runtime state should be clearly owned by dedicated modules,
especially for:

- pending requests
- thread settings
- thread context usage
- cached command items
- thread cwd lookup
- SSE subscriber counts and delayed unsubscribe timers

### Mapping isolation

Conversion logic between:

- app-server payloads
- bridge runtime structures
- shared protocol payloads

should be extracted from request orchestration where practical, so feature work
does not require editing one monolithic service file.

### Composition-first server entry

The top-level bridge bootstrap should primarily:

- load config
- instantiate services
- compose routes
- start the HTTP server
- coordinate shutdown

It should not remain the main home for per-route business logic.

## Acceptance Criteria

- No file in `apps/bridge/src` exceeds 1000 lines after the refactor.
- The bridge still builds and type-checks successfully.
- Existing client-facing bridge routes remain behaviorally compatible.
- Upstream `codex app-server` lifecycle semantics remain unchanged.
- Thread-related translation and cache logic are no longer concentrated in a
  single monolithic file.
- HTTP route wiring and SSE subscription handling are no longer concentrated in
  a single monolithic file.
- The resulting directory structure makes future bridge feature work easier to
  place without re-growing the original files.

## Risks

### Risk: behavior drift during code movement

Large file splits can accidentally change subtle runtime behavior, especially in:

- pending request tracking
- approval response mapping
- SSE subscription lifecycle
- temporary thread resume/unsubscribe flow

Mitigation:

- keep the refactor incremental
- preserve existing method contracts during extraction
- run bridge type-checking after each coherent slice
- review moved logic against the original implementation before finalizing

### Risk: over-abstraction

A maintainability refactor can create too many thin wrappers without improving
clarity.

Mitigation:

- split by real responsibility boundaries
- prefer a small number of cohesive modules over many trivial helpers
- keep composition explicit and typed

## Validation Requirements

Minimum validation for this refactor:

- `pnpm --filter @my-codex-app/bridge typecheck`

Recommended validation:

- review the final `apps/bridge/src` layout for responsibility clarity
- inspect route behavior and thread-event wiring for semantic parity with the
  pre-refactor implementation
