# Local Pairing, Device Trust, And Session Auth Spec

## Relationship To Existing Platform Spec

This spec refines the local-mode authentication portion of:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`

It replaces the current bootstrap shared-token approach with an explicit local pairing and revocable device-trust model while preserving the existing Web-first bridge/client architecture.

## Background

The current local bridge bootstrap authenticates all browser requests with one shared static token:

- bridge env: `BRIDGE_ACCESS_TOKEN`
- client env: `VITE_BRIDGE_ACCESS_TOKEN`

That bootstrap was acceptable for an early local-development slice, but it does not meet the platform security and recovery requirements already documented for:

- explicit pairing
- revocable device trust
- renewable session credentials
- future reconnect/resync
- future Tauri mobile reuse without moving auth logic into Tauri-only code

## Goals

- Replace the static shared local token with explicit local pairing.
- Give each client device its own revocable trust record.
- Have the client authenticate with short-lived session credentials instead of a shared secret.
- Preserve the existing thread, turn, approval, and user-input capabilities.
- Keep the bridge as the only component that talks directly to Codex app-server.
- Keep the core auth model browser-compatible so it can later be reused by Tauri mobile.

## Non-Goals

- Remote relay authentication and routing.
- QR-only or deep-link-only enrollment flows.
- Multi-user account management.
- Reworking the current bridge transport away from HTTP + SSE for this milestone.
- Requiring Tauri-native secure storage before local mode works in the browser.

## Scope

This milestone covers local direct mode only.

Included:

- local pairing code flow
- bridge-maintained device trust records
- short-lived access token issuance
- refresh-token-based session renewal
- device listing and device revocation
- client-side session bootstrap and refresh handling
- SSE compatibility under the new auth model

Deferred:

- relay-specific auth
- QR polish
- richer device metadata UX
- hardened reconnect/resync state machine beyond the minimum needed to survive access-token expiry

## Current Implementation Constraints

- The current bridge surface is REST + SSE, not a generic RPC transport.
- Browser `EventSource` cannot attach arbitrary authorization headers.
- Existing thread/list, thread/read, thread/start, turn/start, turn/interrupt, and request/respond flows must continue to work.
- Current bridge pending-request recovery depends on bridge authority and upstream app-server semantics, not on client-side event ordering.

## Pairing And Auth Model

### 1. Pairing challenge

The bridge exposes a local-only pairing challenge state.

- The challenge is created or refreshed on the computer that runs the bridge.
- The challenge contains a short-lived one-time pairing code.
- The code is intended to be shown locally to the user and manually entered by the client.
- The challenge expires automatically after a short TTL.

### 2. Pairing completion

An unpaired client submits:

- the pairing code
- a client-generated device identifier
- device metadata suitable for display and later revocation

If the code is valid, the bridge creates a device trust record and returns:

- device metadata
- a short-lived access token
- a longer-lived refresh token
- session expiry metadata

### 3. Device trust

Each paired device has a trust record stored by the bridge.

The record is bridge authority for:

- whether the device is trusted
- whether refresh is still allowed
- what human-readable metadata should be shown in device-management surfaces

Device trust must be inspectable and revocable.

### 4. Access token

The access token is a short-lived bridge-issued bearer credential used for normal bridge APIs.

- Regular HTTP APIs use `Authorization: Bearer <access-token>`.
- SSE uses `access_token=<access-token>` query params because of browser `EventSource` limitations.
- Access-token expiry should be short enough that revocation latency is bounded.

### 5. Refresh token

The refresh token is a longer-lived credential tied to one trusted device.

- It is only used with the refresh endpoint.
- The bridge stores only a hashed representation, not the raw token.
- Refresh rotates session state and returns a new access token.
- Once the device is revoked, refresh must fail.

## Transport And Protocol Direction

The existing bridge transport remains:

- HTTP request/response for reads, writes, pairing, refresh, and device management
- SSE for live thread events

The logical protocol gains new auth capability groups without forcing an immediate transport rewrite.

## Responsibilities

### Bridge

- maintain pairing challenge state
- persist device trust records
- issue and validate access tokens
- validate and rotate refresh sessions
- expose device management APIs
- reject unauthenticated bridge reads and writes
- keep Codex app-server integration semantics unchanged

### Client

- bootstrap as unpaired or authenticated
- store device credentials in a browser-compatible way
- attach access credentials to bridge requests
- refresh sessions when access tokens expire
- re-establish live subscriptions after refresh when needed
- surface pairing/session/device state in the connection flow

### Protocol Package

- define typed pairing/session/device payloads
- keep thread/turn/request contracts transport-agnostic and unchanged where possible
- avoid leaking Codex app-server internals into auth types

## Acceptance Criteria

- The local bridge no longer requires `BRIDGE_ACCESS_TOKEN` to serve the client.
- The browser client no longer requires `VITE_BRIDGE_ACCESS_TOKEN` to start normal usage.
- An unpaired client cannot access thread, turn, or request APIs.
- A user can complete explicit local pairing with a short-lived code.
- The bridge stores a revocable trust record per paired device.
- A paired client can continue to use existing thread/list, thread/read, turn/start, turn/interrupt, and request/respond flows.
- Access token expiry can be recovered with refresh without re-pairing.
- Revoked devices lose the ability to refresh or continue creating new authenticated sessions.
- The resulting implementation remains browser-first and does not depend on Tauri-only auth primitives.

## Assumptions

- MVP pairing uses manual code entry rather than QR.
- Browser local storage is acceptable for the initial Web client credential store.
- Bridge-local file persistence is sufficient for the first revocable device-trust implementation.
