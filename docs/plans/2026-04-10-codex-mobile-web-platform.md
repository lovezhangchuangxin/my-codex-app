# Codex Mobile/Web Platform Technical Plan

## Relationship To Spec

This plan implements the platform defined in:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`

The system is designed as a shared Web client running in both browser and Tauri 2 mobile, backed by a desktop bridge that talks to Codex app-server and an optional relay for cross-network access.

Implementation and protocol decisions in this repository must be validated against the local Codex source tree at:

- `~/Desktop/projects/sources/codex`

In practice, the bridge and protocol layers should be developed with that repository open as the primary upstream reference for app-server methods, event semantics, and request/response behavior.

## Recommended Repository Layout

```text
my-codex-app/
  apps/
    client/        shared Web app for browser + Tauri mobile
    bridge/        desktop bridge service
    relay/         remote relay service
  packages/
    protocol/      typed client/bridge/relay protocol
    sdk/           shared client SDK for transport and state sync
    ui/            shared UI components if needed
  docs/
    specs/
    plans/
```

## Architectural Decision Summary

### Decision 1: Web-first shared client

The browser and mobile app will share one primary application codebase.

Implementation consequence:

- `apps/client` must run in a normal browser without Tauri APIs for core features.
- Tauri-specific code must be isolated behind small capability adapters.

### Decision 2: Bridge-centric integration

The bridge is the only component that talks directly to Codex app-server.

Implementation consequence:

- Clients do not connect directly to Codex app-server.
- The bridge owns authoritative synchronization and recovery.

### Decision 3: Relay as transport, not execution engine

The relay only routes authenticated traffic between client and bridge.

Implementation consequence:

- The relay should not parse or re-implement Codex semantics beyond routing/session control.
- Codex action execution remains local to the user's computer.

### Decision 4: Recovery over persistent mobile background execution

The product will restore state rapidly after disconnect rather than depend on mobile background permanence.

Implementation consequence:

- The client must support reconnect + resync as a first-class flow.
- The bridge must expose enough state to recover quickly.

## Component Responsibilities

## `apps/client`

Responsibilities:

- render thread list and thread detail
- manage selected workspace/thread UI state
- establish authenticated connection to bridge or relay
- maintain live subscription and reconnect loop
- submit message, interrupt, approval, and user-input actions

Design rules:

- Core business flows must be transport-agnostic.
- No direct dependency on Codex app-server types.
- No direct dependency on relay internals.

### Suggested client modules

- `src/app/`
  - route shells and application composition
- `src/features/threads/`
  - thread list, thread detail, selectors
- `src/features/live/`
  - stream subscription, reconnect state, resync triggers
- `src/features/requests/`
  - approvals and tool user-input UI
- `src/features/session/`
  - device pairing state, server target, auth tokens
- `src/platform/`
  - browser and Tauri host capability adapters

## `apps/bridge`

Responsibilities:

- spawn or connect to local Codex app-server
- translate client protocol calls into app-server operations
- maintain client sessions and paired-device trust
- merge streaming updates with authoritative reads
- provide local discovery/pairing endpoint
- maintain optional outbound relay session

### Suggested bridge modules

- `src/app-server/`
  - local app-server process management
  - typed request client
  - event stream ingestion
- `src/state/`
  - thread cache
  - pending request cache
  - live subscription registry
- `src/auth/`
  - pairing flow
  - token issuance and validation
  - device registry
- `src/transports/`
  - LAN HTTP/WebSocket server
  - relay tunnel client
- `src/api/`
  - client-facing endpoints or RPC handlers

## `apps/relay`

Responsibilities:

- authenticate bridges and clients
- register active bridge sessions
- associate devices/users with bridge instances
- forward real-time traffic
- support reconnect and tunnel restoration

### Suggested relay modules

- `src/auth/`
  - bridge auth
  - client auth
- `src/routing/`
  - bridge presence registry
  - session routing table
- `src/tunnel/`
  - duplex message forwarding
- `src/audit/`
  - connection/session metadata only, not Codex content by default

## `packages/protocol`

Responsibilities:

- define typed RPC/event contracts between client, bridge, and relay
- define shared event envelopes
- define pairing, auth, and reconnect payloads

The protocol package should be the only shared contract authority above raw transport.

## `packages/sdk`

Responsibilities:

- provide transport clients for browser and Tauri runtime
- provide reconnecting session client
- provide state synchronization helpers

## Transport Model

## Local network mode

### Bridge startup

1. User runs the bridge on their computer.
2. Bridge starts local Codex app-server integration.
3. Bridge listens on LAN-safe transport with authentication required.

### Pairing

Recommended flow:

1. Bridge generates a one-time pairing secret.
2. User opens pairing screen on computer or terminal output.
3. Phone scans QR code or enters code.
4. Bridge issues a long-lived device credential plus short-lived session tokens.

### Runtime connection

1. Client connects directly to bridge.
2. Client authenticates with device/session token.
3. Client subscribes to thread summaries and live updates.
4. Bridge serves as the source of truth for reads and writes.

## Remote relay mode

### Bridge registration

1. Bridge authenticates to relay using bridge credentials.
2. Relay marks bridge online and routable.

### Client connection

1. Client authenticates to relay as a user/device.
2. Client selects a registered computer/bridge.
3. Relay binds client session to that bridge.
4. Relay forwards duplex protocol traffic.

### Security expectation

- Relay can route traffic.
- Relay should not become a Codex execution authority.
- Sensitive long-lived credentials should remain scoped and revocable.

## Protocol Shape

Protocol should be defined at the bridge layer rather than exposing app-server directly.

Implementation note:

- the logical request groups below do not require a custom transport rewrite for MVP
- the current local implementation may map these capabilities onto HTTP routes plus SSE

### Request groups

- session
  - `pair/start`
  - `pair/complete`
  - `session/refresh`
  - `device/list`
  - `device/revoke`
- threads
  - `thread/list`
  - `thread/read`
  - `thread/start`
- turns
  - `turn/start`
  - `turn/interrupt`
- pending requests
  - `request/respond`
- stream
  - `stream/subscribe`
  - `stream/unsubscribe`
  - `stream/resync`

### Event groups

- connection state
  - connected
  - reconnecting
  - resynced
  - disconnected
- thread summaries updated
- thread detail updated
- turn started/completed
- assistant delta
- pending request added/resolved
- sync warning/error

## Mapping To Codex app-server

Bridge-to-app-server should use official app-server methods and notifications.

### Required app-server operations

- `thread/list`
- `thread/read`
- `thread/start`
- `thread/resume`
- `turn/start`
- `turn/interrupt`
- `turn/steer` if needed later
- server request response flow for:
  - command approvals
  - file approvals
  - permissions approvals
  - tool user input

### Design rule

Do not expose app-server raw transport or unstable desktop-private protocols directly to the shared client.

## State and Synchronization Strategy

## Authoritative source of truth

- The bridge is authoritative for connected client state.
- Codex app-server is authoritative behind the bridge.

## Client state model

The client should maintain:

- connection/session state
- thread list cache
- selected thread detail cache
- pending request cache
- current live subscription state

## Recovery algorithm

When the client reconnects:

1. Re-authenticate current session if possible.
2. Fetch latest thread list.
3. Re-read selected thread.
4. Rebuild pending-request state from bridge authority.
5. Re-subscribe to stream events.
6. Ignore stale local assumptions that conflict with bridge state.

## Pending request handling

The bridge should track pending approvals/user-input requests in a way that survives client reconnect.

The client should not rely only on in-memory event order to reconstruct pending request state.

## Authentication and Pairing Plan

## Device trust model

Each client device receives:

- a device identifier
- a revocable trust record
- renewable short-lived access tokens

## Local pairing

Recommended MVP:

- one-time code or QR pairing
- manual code entry is acceptable for the first local-only implementation
- bridge signs or stores device trust locally
- later sessions use renewable tokens

## Remote mode auth

Recommended direction:

- bridge authenticates to relay with bridge credentials
- client authenticates separately as a paired device/user
- relay issues scoped forwarding session

## Token strategy

- short-lived access token
- longer-lived refresh or re-authorization token
- explicit revocation path for lost devices

Bootstrap note:

- until pairing UX and device trust records land, the local bridge bootstrap may use an explicitly configured shared access token for every client-to-bridge request
- this is only an implementation bridge for early milestones, not the final pairing model

## Tauri 2 Host Integration Plan

Tauri-specific behavior should be limited to host concerns.

### Appropriate Tauri usage

- app shell packaging
- local secure storage if needed
- host identity or device metadata
- optional deep-link handling later

### Avoid

- placing core domain logic in Tauri commands
- making UI or protocol behavior depend on Tauri runtime presence

## MVP Scope

## MVP included

- shared client app for browser + Tauri mobile
- bridge process
- local network pairing and direct mode
- thread list
- thread detail
- live assistant stream
- send message
- interrupt turn
- command/file approval response
- tool user-input response
- disconnect/reconnect/resync flow

## MVP deferred

- remote relay mode production hardening
- push notifications
- advanced account management UI
- offline support
- multi-provider support

## Phased Delivery

### Phase 1

- initialize repository structure
- implement protocol package skeleton
- implement bridge <-> app-server integration
- implement local-only authenticated bridge API
- implement shared client with thread list/detail and reconnect

### Phase 2

- approvals and user-input flows
- pairing UX
- Tauri mobile shell integration
- local-network end-to-end validation

### Phase 3

- relay service
- remote pairing and routing
- relay reconnect and session restoration

### Phase 4

- notifications, diagnostics, device management, and polish

## Testing and Verification Plan

## Protocol tests

- schema validation
- event envelope parsing
- auth payload validation

## Bridge tests

- app-server mapping tests
- reconnect and resync tests
- pending request recovery tests
- local auth/pairing tests

## Client tests

- thread list rendering
- thread detail rendering
- reconnect state transitions
- pending approval/user-input flows

## End-to-end tests

- local mode pairing and message send
- background/disconnect/resume recovery simulation
- remote relay round-trip once relay exists

## Implementation Notes For Next Step

The next implementation task after document approval should be repository bootstrapping:

1. create repository folders and workspace config
2. define protocol package
3. scaffold bridge service
4. scaffold shared client app
5. establish one thin end-to-end flow:
   - read thread list from bridge
   - bridge reads thread list from app-server

## Risks and Mitigations

### Risk: mobile background disconnects

Mitigation:

- design reconnect and resync as the normal path

### Risk: app-server transport behavior changes

Mitigation:

- isolate app-server integration in bridge
- keep client protocol stable and independent

### Risk: relay becomes over-privileged

Mitigation:

- keep execution local
- minimize relay semantic knowledge
- scope credentials tightly

### Risk: Tauri/mobile-specific complexity leaks into client logic

Mitigation:

- enforce browser-first runtime compatibility for core client modules
