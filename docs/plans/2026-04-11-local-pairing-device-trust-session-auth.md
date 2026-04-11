# Local Pairing, Device Trust, And Session Auth Technical Plan

## Relationship To Specs

This plan implements:

- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-10-codex-mobile-web-platform.md`

It also reconciles one planning mismatch in the existing platform plan:

- the logical protocol may describe pairing/session capability groups
- the concrete MVP transport remains HTTP + SSE

This task does not introduce a transport rewrite.

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- the changes are tightly coupled across bridge auth, protocol typing, SDK session handling, and client bootstrap
- the critical path is bridge/session semantics rather than parallelizable UI-only work

## Phase Breakdown

### Phase 1: Local pairing and session-auth MVP

Implement in this task:

- bridge pairing challenge
- persistent device trust store
- access token validation
- refresh token rotation
- device list and revoke APIs
- SDK refresh-aware bridge client
- client-side pairing/session bootstrap

### Phase 2: Reconnect/resync hardening

Defer beyond this task:

- richer connection-state machine
- explicit stream resync protocol
- resume-after-bridge-restart polish

### Phase 3: Tauri and relay follow-up

Defer beyond this task:

- Tauri secure storage adapter
- relay session forwarding auth

## Module Changes

## `packages/protocol`

Add typed local-auth contracts:

- `PairingStatusResponse`
- `PairingCompleteRequest`
- `PairingCompleteResponse`
- `SessionRefreshRequest`
- `SessionRefreshResponse`
- `DeviceTrustRecord`
- `DeviceListResponse`
- `DeviceRevokeRequest`
- `AuthErrorCode`

Keep existing:

- thread/list
- thread/read
- thread/start
- turn/start
- turn/interrupt
- request/respond

## `apps/bridge`

Add bridge-local auth modules:

- `src/auth/tokenCodec.ts`
- `src/auth/deviceTrustStore.ts`
- `src/auth/pairingService.ts`
- `src/auth/sessionService.ts`
- `src/auth/authenticate.ts`

Responsibilities:

- generate short-lived pairing code
- persist trusted devices and refresh-token hashes
- sign/verify short-lived access tokens
- authenticate REST and SSE requests
- support refresh and revoke

Update `src/server.ts`:

- remove the bootstrap `BRIDGE_ACCESS_TOKEN` requirement
- add pairing and session routes
- attach auth middleware to protected routes
- keep `/healthz` and pairing-status bootstrap readable without credentials

Keep existing thread integration in `threadService` intact except where request context needs authenticated device/session metadata.

## `packages/sdk`

Extend the SDK with auth-aware transport:

- credential store abstraction
- refresh-capable bridge client wrapper
- fetch requests use `Authorization` header
- SSE subscriptions continue to use query `access_token`
- on `401`, attempt refresh once and retry the request
- on stream auth failure, refresh then reconnect the stream for the selected thread

## `apps/client`

Add browser-side auth bootstrap:

- local-storage-backed credential store
- connection route for pairing/session/device state
- runtime provider creates the bridge client from stored credentials instead of env token

Keep thread and request UI logic on top of the shared SDK runtime.

## Data And State Model

## Bridge-persisted device trust record

Fields:

- `deviceId`
- `label`
- `platform`
- `createdAt`
- `updatedAt`
- `lastSeenAt`
- `revokedAt`
- `refreshTokenHash`
- `refreshTokenIssuedAt`

Storage format:

- bridge-local JSON file for MVP

## Access token claims

Use a bridge-signed compact bearer token carrying:

- `sub` as `deviceId`
- `sid` as session id
- `iat`
- `exp`

Validation also checks:

- corresponding device trust record still exists and is not revoked

## Client credential state

Store:

- `deviceId`
- `deviceLabel`
- `refreshToken`
- latest `accessToken`
- `accessTokenExpiresAt`

Browser storage:

- local storage for MVP

## HTTP Surface

Public bootstrap endpoints:

- `GET /api/pairing`
- `POST /api/pairing/complete`
- `GET /healthz`

Authenticated endpoints:

- existing thread/turn/request APIs
- `POST /api/session/refresh`
- `GET /api/devices`
- `POST /api/devices/revoke`
- `GET /api/events`

Authentication rules:

- standard HTTP routes prefer `Authorization: Bearer`
- SSE accepts `access_token` query param
- bridge returns `401` with typed auth error payloads for expired, missing, or revoked credentials

## Implementation Order

1. Add protocol auth types.
2. Add bridge auth primitives and persistent trust store.
3. Add bridge pairing, refresh, list, and revoke routes.
4. Replace bridge static-token route protection with session-based auth.
5. Add SDK credential store and refresh-aware request flow.
6. Switch client runtime bootstrap from env token to stored credentials.
7. Update connection UI for unpaired, paired, refreshing, and revoked states.
8. Update README/TODO and relevant platform docs wording where implementation details changed.

## Verification Plan

Minimum required verification:

- workspace typecheck
- bridge typecheck
- client typecheck
- protocol/schema consistency by TypeScript compilation

Manual smoke validation:

1. Start the bridge with no bootstrap token env.
2. Confirm unauthenticated thread access returns `401`.
3. Read pairing status and complete pairing with a valid code.
4. Confirm paired client can list threads, read a thread, send a turn, interrupt, and respond to pending requests.
5. Force access-token expiry and confirm refresh restores normal requests.
6. Confirm SSE reconnect works after refresh for the selected thread.
7. Revoke the device and confirm further refresh or authenticated requests fail.

## Risks And Mitigations

### Risk: SSE auth differs from normal fetch auth

Mitigation:

- standardize on the same access token
- only vary the transport carriage mechanism

### Risk: revocation is too slow with self-contained access tokens

Mitigation:

- keep access-token TTL short
- validate token subject against the trust store on each request

### Risk: reconnect logic regresses existing live thread behavior

Mitigation:

- do not change upstream app-server lifecycle handling
- keep current `thread/resume` and `thread/unsubscribe` integration intact
- only wrap the transport layer with session refresh/retry behavior

### Risk: wording conflict with Codex approval “accept for session”

Mitigation:

- use explicit product terms such as `bridge session`, `device trust`, and `access token`
