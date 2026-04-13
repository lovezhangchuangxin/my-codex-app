# Bridge Modular Refactor Technical Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-13-bridge-modular-refactor.md`

It must remain compatible with the existing bridge-facing requirements defined
by the platform, auth, reconnect, workspace-browser, and composer-control
specs.

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- the refactor is concentrated inside `apps/bridge`
- thread orchestration, app-server transport, and HTTP/SSE server code are
  tightly coupled
- the main risk is semantic drift during extraction, not parallel coding speed

## Design Summary

The refactor should proceed in three internal layers:

1. split app-server transport concerns away from the bridge facade
2. split thread domain orchestration away from mapping and cache logic
3. split HTTP bootstrap away from route helpers and SSE subscription state

This keeps external behavior stable while reducing the maintenance pressure from
monolithic files.

## Target Module Layout

The implementation should move toward:

```text
apps/bridge/src/
  app-server/
    jsonRpcProcessClient.ts
    types.ts
  server/
    bridgeServer.ts
    config.ts
    http.ts
    logging.ts
    threadEventStreamRegistry.ts
  threads/
    permissionPresets.ts
    threadEventTranslator.ts
    threadMappers.ts
    threadRuntimeCache.ts
  auth/
  appServerClient.ts
  pendingRequestState.ts
  server.ts
  threadService.ts
  workspaceService.ts
```

The root-level `appServerClient.ts`, `threadService.ts`, and `server.ts` may
remain as the public package entry files for now, but they should become thin
composition layers.

## Phase Breakdown

### Phase 1: Refactor app-server integration

Goal:

- make the upstream transport layer easier to reason about without changing the
  bridge-facing API used by the rest of the package

Changes:

- extract app-server request/result/event typings into
  `apps/bridge/src/app-server/types.ts`
- extract JSON-RPC child-process transport into
  `apps/bridge/src/app-server/jsonRpcProcessClient.ts`
- reduce `apps/bridge/src/appServerClient.ts` to a typed facade that:
  - enforces initialize-before-use
  - exposes bridge-needed request methods
  - forwards notifications and server requests from the transport layer

Validation after phase:

- bridge typecheck

### Phase 2: Refactor thread domain logic

Goal:

- separate mutable bridge runtime state from protocol translation and request
  parsing

Changes:

- add `apps/bridge/src/threads/threadRuntimeCache.ts` for:
  - pending requests
  - request method lookup
  - thread cwd cache
  - thread settings cache
  - thread context-usage cache
  - cached command items
- add `apps/bridge/src/threads/threadMappers.ts` for:
  - app-server thread/turn/item/user-input mapping
  - model mapping
  - token-usage mapping
  - permission profile mapping
- add `apps/bridge/src/threads/permissionPresets.ts` for:
  - curated preset -> app-server approval/sandbox mapping
  - raw app-server settings -> preset derivation
- add `apps/bridge/src/threads/threadEventTranslator.ts` for:
  - app-server notification -> bridge event translation
  - app-server server-request -> pending request translation
  - approval response remapping based on request method
- reduce `apps/bridge/src/threadService.ts` to orchestration for:
  - list/read/start/resume/unsubscribe/startTurn/interrupt/respond
  - cache updates around thread settings and reads
  - event subscription wiring

Validation after phase:

- bridge typecheck
- review that pending request and event semantics remain unchanged

### Phase 3: Refactor HTTP and SSE server composition

Goal:

- make the HTTP layer explicit and easier to extend without re-growing the main
  server file

Changes:

- add `apps/bridge/src/server/config.ts` for env-derived bridge config
- add `apps/bridge/src/server/http.ts` for:
  - JSON responses
  - error responses
  - JSON body parsing
  - route-level parsing helpers
  - app-server error classification
- add `apps/bridge/src/server/logging.ts` for pairing-code log formatting
- add `apps/bridge/src/server/threadEventStreamRegistry.ts` for:
  - SSE client registry
  - per-thread subscriber counts
  - delayed unsubscribe timers
  - forwarding bridge events to active SSE clients
- add `apps/bridge/src/server/bridgeServer.ts` for:
  - route dispatch
  - auth gate placement
  - service composition around auth/thread/workspace/event-registry
- reduce `apps/bridge/src/server.ts` to:
  - top-level bootstrap
  - service construction
  - event forwarding hookup
  - shutdown wiring

Validation after phase:

- bridge typecheck
- review route behavior for semantic parity

## Implementation Order

1. Add the refactor spec and plan documents.
2. Extract app-server types and transport.
3. Rebuild `AppServerClient` as a thin facade on top of the extracted transport.
4. Extract thread caches and pure mappers.
5. Extract thread event/request translation.
6. Reduce `ThreadService` to orchestration.
7. Extract server config, HTTP helpers, logging, and SSE registry.
8. Rebuild the bridge HTTP server as a composed module.
9. Reduce the root `server.ts` bootstrap.
10. Run bridge typecheck and do final self-review.

## Verification Plan

Minimum required verification:

- `pnpm --filter @my-codex-app/bridge typecheck`

Review checklist:

- confirm no file in `apps/bridge/src` exceeds 1000 lines
- confirm public bridge routes remain the same
- confirm SSE subscribe / delayed unsubscribe behavior is unchanged
- confirm pending request add / resolve behavior is unchanged
- confirm approval response remapping still matches the pre-refactor behavior

## Risks And Mitigations

### Risk: pending request semantics change during extraction

This is the most fragile thread-domain behavior because multiple app-server
request shapes are normalized into one bridge model.

Mitigation:

- keep the existing parsing branches intact during movement
- move logic with minimal behavioral edits first, then simplify only if safe

### Risk: SSE lifecycle drift

Subscriber counts and delayed unsubscribe behavior are sensitive to route and
timer wiring.

Mitigation:

- preserve the current sequence:
  - attach client
  - cancel pending unsubscribe
  - resume thread only when needed
  - delay unsubscribe after last disconnect

### Risk: refactor stops at file movement only

Moving code without clarifying ownership would not solve the maintenance
problem.

Mitigation:

- enforce real ownership boundaries:
  - transport
  - thread runtime/cache
  - mapping/translation
  - HTTP/SSE composition
