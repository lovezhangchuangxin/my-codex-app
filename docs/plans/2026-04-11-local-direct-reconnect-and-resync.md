# Local Direct Reconnect And Resync Technical Plan

## Relationship To Specs

This plan implements:

- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-10-codex-mobile-web-platform.md`

It narrows the currently open milestone in:

- `TODO.md` item 5: `Harden Reconnect And Resync`

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- bridge subscription behavior, SDK state management, and client rendering are tightly coupled
- the task is primarily about correctness of recovery sequencing rather than parallel UI slices

## Design Summary

The implementation will add one explicit local-direct runtime state machine and
one bridge-side thread-subscription grace mechanism.

Core decisions:

- keep the bridge as the authority for current local-direct state
- keep app-server request ordering and resume semantics unchanged
- recover by re-reading bridge authority after reconnect instead of trusting old event gaps
- avoid immediate upstream `thread/unsubscribe` on transient client disconnects

## Module Changes

## `packages/protocol`

Add or refine runtime-facing local state types for:

- local auth/session state
- reconnect/resync status
- explicit terminal auth recovery outcomes

Keep thread, turn, request, and event contracts unchanged unless a small typing
addition is needed for state reporting.

## `apps/bridge`

Update `src/server.ts`:

- add short-lived unsubscribe timers per thread
- cancel a pending unsubscribe when a subscriber returns within the grace window
- only call `threadService.unsubscribeThread(threadId)` after the grace window expires with zero subscribers

Keep:

- existing auth enforcement
- existing REST surface
- existing selected-thread SSE route shape

Do not move reconnect logic into Tauri-specific code or into a relay abstraction.

## `packages/sdk`

Update `src/bridgeClient.ts`:

- expose typed auth/transport error information that runtime logic can classify
- keep serialized refresh behavior
- let stream failure feed a runtime-owned reconnect path instead of silently staying stale

Update `src/threadState.ts`:

- extend `ThreadRuntimeSnapshot` with explicit connection/session state
- keep thread list/detail/mutation state distinct from connection state

Update `src/threadRuntime.ts`:

- add bootstrap logic for unpaired vs paired startup
- add a serialized reconnect/resync coordinator
- restore selected thread after startup and after reconnect
- perform authoritative resync in fixed order:
  - threads
  - selected thread detail
  - stream reattach
- classify failures into:
  - `unpaired`
  - `refreshing`
  - `authenticated`
  - `reconnecting`
  - `resyncing`
  - `revoked`
  - `expired`
  - `disconnected`

## `apps/client`

Update `src/lib/runtime/runtime-provider.tsx`:

- bootstrap the runtime through the new state-machine entrypoint
- avoid eager thread loading for unpaired browsers
- trigger reconnect attempts from browser lifecycle events where useful

Update `src/features/connection/routes/connection-route.tsx`:

- render the explicit runtime connection/session state
- distinguish paired credentials from healthy authenticated runtime state
- keep pairing / revoke / refresh controls aligned with the new state machine

Keep thread and inbox UI on top of the shared runtime snapshot.

## State Model Details

Add a runtime snapshot field similar to:

- `connection`
  - `kind: "unpaired"`
  - `kind: "refreshing"`
  - `kind: "authenticated"`
  - `kind: "reconnecting"`
  - `kind: "resyncing"`
  - `kind: "revoked"`
  - `kind: "expired"`
  - `kind: "disconnected"`

Recommended extra metadata:

- optional status message
- optional last successful sync timestamp
- optional error code or human-readable recovery reason

Rules:

- `threads` and `detail` may remain `ready` during reconnect, but the connection state must make staleness explicit
- `authenticated` is only emitted after the last resync completed successfully
- terminal auth states should prevent silent automatic retries that cannot succeed

## Reconnect Sequencing

Recommended runtime flow:

1. `bootstrap()`
2. inspect credential store
3. if no credentials:
   - set `connection = unpaired`
   - set thread snapshot to idle/empty baseline
4. if credentials exist:
   - call `resync({ reason: "startup" })`

Recommended `resync()` behavior:

1. if refresh is needed, set `refreshing` and rotate credentials
2. set `resyncing`
3. fetch thread list
4. if a selected thread id exists, fetch thread detail
5. attach live stream for selected thread
6. set `authenticated`

Recommended stream failure behavior:

1. set `reconnecting`
2. back off
3. refresh if needed
4. call `resync({ reason: "stream-interrupted" })`

Recommended auth error mapping:

- `revokedDevice` => clear live stream, keep credentials visible for UX, set `revoked`
- `invalidRefreshToken` / `expiredRefreshToken` => clear live stream, set `expired`
- `missingCredentials` => set `unpaired`

## Bridge Grace Window

Add a server-owned per-thread timer map.

Suggested MVP behavior:

1. SSE client subscribes for thread `T`
2. increment subscriber count
3. clear any pending unsubscribe timer for `T`
4. if first subscriber, call `threadService.resumeThread(T)`
5. when an SSE client closes:
   - decrement subscriber count
   - if count remains above zero, do nothing else
   - if count becomes zero, schedule delayed unsubscribe
6. when the timer fires:
   - verify subscriber count is still zero
   - call `threadService.unsubscribeThread(T)`

This intentionally keeps upstream `thread/unsubscribe` semantics, but shifts when
the bridge chooses to call it.

## Implementation Order

1. Add the reconnect/resync spec and plan docs.
2. Add runtime connection/session state types.
3. Refactor SDK bridge-client errors so runtime can classify failures.
4. Implement runtime bootstrap + reconnect + authoritative resync flow.
5. Add bridge thread unsubscribe grace handling.
6. Integrate provider lifecycle hooks.
7. Update connection UI to render the explicit state model.
8. Update README and TODO wording if the new milestone is fully landed.

## Verification Plan

Minimum required verification:

- `pnpm --filter @my-codex-app/protocol typecheck`
- `pnpm --filter @my-codex-app/sdk typecheck`
- `pnpm --filter @my-codex-app/bridge typecheck`
- `pnpm --filter @my-codex-app/client typecheck`

Manual smoke validation:

1. Start unpaired and confirm the runtime shows `unpaired`.
2. Pair successfully and confirm the runtime reaches `authenticated`.
3. Refresh the page on a selected thread and confirm:
   - thread list restores
   - selected thread restores
   - pending requests restore
   - stream resumes
4. Force access-token refresh and confirm the runtime moves through `refreshing` and returns to `authenticated`.
5. Simulate a brief stream disconnect and confirm the runtime moves through `reconnecting` then `resyncing`.
6. Revoke the active device and confirm the runtime lands in `revoked`.
7. Invalidate refresh credentials and confirm the runtime lands in `expired`.

## Risks And Mitigations

### Risk: reconnect logic silently keeps stale detail

Mitigation:

- make reconnect and resync first-class snapshot state
- require authoritative thread re-read before returning to `authenticated`

### Risk: bridge unsubscribes too aggressively during page refresh

Mitigation:

- add a short unsubscribe grace window
- only unload after the grace window expires with zero subscribers

### Risk: reconnect work races across fetch and stream failures

Mitigation:

- serialize refresh and resync work inside the runtime
- dedupe concurrent recovery attempts

### Risk: bridge behavior diverges from upstream app-server lifecycle

Mitigation:

- keep upstream `thread/resume`, request replay, and `thread/unsubscribe` semantics unchanged
- only change the bridge policy for when it invokes upstream unsubscribe
