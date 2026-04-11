# Local Direct Reconnect And Resync Spec

## Relationship To Existing Specs

This spec extends:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`

It defines the next local-direct milestone after pairing and session auth:

- explicit reconnect and resync behavior
- explicit client connection/session state
- bridge-authoritative recovery after temporary disconnects

## Background

Local pairing, device trust, and session auth are now implemented, but reconnect
behavior is still mostly implicit.

Current gaps:

- refresh-aware auth exists, but runtime recovery is not modeled as an explicit state machine
- SSE reconnect attempts do not fully resync thread and pending-request state
- page refresh or temporary browser disconnect can cause the bridge to unsubscribe too aggressively
- the UI can appear healthy while actually showing stale thread detail

This conflicts with the platform reliability target:

- disconnect and recover quickly
- prefer bridge authority over stale client memory
- make reconnect/resync a normal path rather than an edge case

## Goals

- Make local direct reconnect/resync an explicit bridge/sdk/client flow.
- Give the shared runtime a clear state model for pairing, session validity, reconnect, and resync.
- Recover selected-thread state, pending requests, and live subscriptions from bridge authority after reconnect.
- Preserve existing local direct capabilities:
  - `thread/list`
  - `thread/read`
  - `thread/start`
  - `turn/start`
  - `turn/interrupt`
  - `request/respond`
- Keep the implementation Web-first and reusable by a later Tauri host.

## Non-Goals

- Relay reconnect design.
- Bridge restart recovery that depends on new durable pending-request persistence.
- A transport rewrite away from HTTP + SSE.
- Tauri-native background execution guarantees.
- New Codex app-server semantics beyond official `thread/resume` / `thread/unsubscribe` behavior.

## Scope

Included:

- explicit local runtime connection/session state
- refresh-driven session recovery
- explicit reconnect and resync orchestration
- selected-thread restoration after page refresh
- bridge-side short disconnect grace for thread subscriptions
- UI state for:
  - unpaired
  - authenticated
  - refreshing
  - reconnecting
  - resyncing
  - revoked
  - expired
  - disconnected

Deferred:

- relay-mode recovery
- long-term bridge persistence of pending requests across bridge process restarts
- push notifications or background wake-up strategies

## Current Constraints

- The browser client still uses HTTP requests plus `EventSource`.
- Browser `EventSource` still requires access-token query params.
- The bridge must remain the only client-facing integration point for Codex app-server.
- The bridge must not invent alternate thread/turn/request ordering rules that differ from app-server.
- Upstream app-server remains authoritative for:
  - `thread/resume`
  - `thread/unsubscribe`
  - request lifecycles
  - `serverRequest/resolved` ordering

## Connection And Session State Model

The shared client runtime must expose one explicit local-direct state machine.

Primary states:

- `unpaired`
  - no usable local device credentials exist
- `refreshing`
  - the client has a refresh token and is rotating session credentials
- `authenticated`
  - the client has valid credentials and the runtime snapshot is aligned with bridge authority
- `reconnecting`
  - the bridge is temporarily unreachable or the live stream is interrupted and recovery is in progress
- `resyncing`
  - the client has recovered or refreshed credentials and is rebuilding runtime state from bridge authority
- `revoked`
  - the trusted device was revoked by the bridge
- `expired`
  - the refresh credential is no longer valid and the client must pair again
- `disconnected`
  - the bridge is currently unavailable and recovery has not yet succeeded

State rules:

- `authenticated` means more than “credentials exist”; it means the runtime has completed the current resync cycle.
- `reconnecting` and `resyncing` are distinct:
  - reconnecting is transport/session recovery
  - resyncing is authoritative data reconstruction
- `revoked` and `expired` are terminal until the user clears local credentials or re-pairs.

## Reconnect And Resync Algorithm

### Startup

1. Load stored credentials.
2. If no credentials exist, enter `unpaired`.
3. If credentials exist, ensure the session is still valid.
4. If credentials must be rotated, enter `refreshing`.
5. After valid credentials exist, enter `resyncing` and rebuild runtime state from bridge authority.
6. Only enter `authenticated` after resync completes.

### Temporary disconnect or stream interruption

1. Enter `reconnecting`.
2. Recover session credentials if needed.
3. When authenticated transport is available again, enter `resyncing`.
4. Resync in this order:
   - latest thread list
   - selected thread detail when one is selected
   - pending requests as represented by bridge thread summaries/detail
   - live stream subscription for the selected thread
5. Replace stale local assumptions with bridge results.
6. Enter `authenticated`.

### Auth failure outcomes

- `revokedDevice` => enter `revoked`, clear active session assumptions
- `invalidRefreshToken` or `expiredRefreshToken` => enter `expired`
- bridge unreachable / network failure => enter `disconnected` and keep retry entry points

## Bridge Recovery Responsibility

The bridge remains the local authority for thread recovery.

To support quick page refresh and short browser disconnects, the bridge must not
immediately unsubscribe from the upstream thread the moment the last SSE client closes.

Instead:

- the bridge keeps a short thread-subscription grace window
- reconnect inside that grace window reuses the still-loaded upstream thread
- if the grace window expires with no subscribers, the bridge may call `thread/unsubscribe`

This preserves upstream app-server semantics while reducing accidental unloads during:

- page refresh
- mobile/browser backgrounding
- brief LAN interruptions

## Responsibilities

### Bridge

- maintain authenticated HTTP and SSE access
- keep thread subscriptions alive briefly across short client disconnects
- remain authoritative for current thread summaries and pending-request state
- keep upstream app-server semantics intact

### SDK

- own the explicit reconnect/resync state machine
- classify auth failures and disconnect failures explicitly
- serialize refresh and resync work
- rebuild thread list/detail/live state from bridge authority

### Client

- present the explicit local-direct state model
- avoid treating “credentials exist” as equivalent to “healthy session”
- trigger reconnect/resync on browser lifecycle changes where helpful
- preserve route-driven selected-thread restoration

## Acceptance Criteria

- A browser with no stored credentials enters `unpaired` without treating thread loading as a generic error.
- Access-token expiry can be recovered through `refreshing` without manual re-pairing.
- Page refresh on `/threads/:threadId` restores:
  - thread list
  - selected thread
  - pending requests
  - live stream subscription
- Temporary disconnects surface `reconnecting` and `resyncing` explicitly before returning to `authenticated`.
- Revoked devices enter `revoked` and stop recovering automatically.
- Expired refresh credentials enter `expired` and require re-pairing.
- Existing local direct thread, turn, interrupt, and request-response capabilities continue to work.

## Assumptions

- A short bridge-side grace window is acceptable for the local-direct MVP.
- Bridge authority for pending requests remains in-memory across short disconnects, not across bridge restarts.
- Authoritative resync after reconnect is preferred over trying to infer missed event ordering client-side.
