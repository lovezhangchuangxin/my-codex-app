# TODO

This file tracks only the next larger milestones for `my-codex-app`.
Do not use it for tiny cleanup tasks.

## Current Baseline

Already implemented:

- [x] `pnpm` monorepo bootstrap with:
  - `apps/client`
  - `apps/bridge`
  - `packages/protocol`
- [x] shared client runtime in `packages/sdk`
- [x] bridge -> Codex app-server stdio JSON-RPC initialization
- [x] bridge HTTP APIs:
  - `GET /api/threads`
  - `GET /api/threads/:threadId`
  - `GET /api/events` (minimal SSE stream for a selected thread)
  - `POST /api/threads/start`
  - `POST /api/turns/start`
  - `POST /api/turns/interrupt`
  - `POST /api/requests/respond`
- [x] browser client thread list
- [x] browser client thread detail
- [x] minimal live event handling for:
  - thread status changes
  - turn started / completed
  - item started / completed
  - agent message delta
- [x] pending request handling for:
  - command approvals
  - file-change approvals
  - permission requests
  - tool user-input requests
- [x] temporary bootstrap auth using:
  - `BRIDGE_ACCESS_TOKEN`
  - `VITE_BRIDGE_ACCESS_TOKEN`

Known constraints of the current baseline:

- [ ] auth is only a temporary local bootstrap token, not the final pairing model
- [ ] pending request UX is intentionally minimal and still needs reconnect hardening polish
- [ ] reconnect/resync behavior is still minimal
- [ ] Tauri mobile shell and relay are not implemented

## Next Major Goals

### [x] 1. Build a Real Client State Layer

Goal:

- move thread list/detail/live merge logic out of `apps/client/src/App.tsx`
- introduce a shared client SDK or state module aligned with the plan

Expected outcome:

- [x] `packages/sdk` exists
- [x] thread read + live event merge is encapsulated behind typed APIs
- [x] UI components stop owning transport-level event stitching

### [x] 2. Implement Thread Actions

Goal:

- add the first write-path bridge/client flow

Scope:

- `thread/start`
- `turn/start` mapped to a client-facing send-message action
- `turn/interrupt`

Expected outcome:

- [x] create a new thread from the client
- [x] send a message to an existing thread
- [x] interrupt an in-progress turn
- [ ] verify that live updates work against real turn execution

### [x] 3. Implement Pending Request Flows

Goal:

- support the app-server request/response workflows that matter for remote control

Scope:

- command approvals
- file-change approvals
- permission/user-input responses

Expected outcome:

- [x] bridge normalizes pending request state
- [x] client can render pending requests at thread level and detail level
- [x] bridge persists enough pending state to survive reconnect

### [ ] 4. Replace Bootstrap Token Auth With Pairing

Goal:

- move from the temporary shared token to the planned local trust model

Scope:

- explicit local pairing flow
- revocable device records
- session/access token issuance and refresh

Expected outcome:

- bridge no longer depends on one static shared token
- local mode aligns with spec security requirements
- auth model is documented in `docs/specs/` and `docs/plans/`

### [ ] 5. Harden Reconnect And Resync

Goal:

- make disconnect/recover behavior match the intended product model

Scope:

- selected thread restore
- thread list refresh
- pending request rehydration
- stream resubscribe behavior

Expected outcome:

- reconnect is an explicit state machine instead of ad hoc reloads
- stale local assumptions are overwritten by bridge authority

### [ ] 6. Add Tauri Mobile Shell Integration

Goal:

- bring the shared client into a Tauri 2 mobile host without moving core logic into Tauri

Scope:

- scaffold Tauri mobile shell
- isolate host-specific adapters
- verify the shared client still runs browser-first

Expected outcome:

- one shared front-end codebase continues to serve browser and Tauri mobile

### [ ] 7. Start Relay Phase

Goal:

- begin the optional remote-access architecture only after local bridge/client flows are solid

Scope:

- relay skeleton
- bridge registration
- client-to-relay authenticated routing

Expected outcome:

- relay remains a routing/authentication component only
- no Codex execution semantics move into relay
