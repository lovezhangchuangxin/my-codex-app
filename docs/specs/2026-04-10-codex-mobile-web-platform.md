# Codex Mobile/Web Platform Spec

## Background

This project aims to provide a formal client platform for Codex that works across:

- Web browsers
- Tauri 2 mobile apps
- A local desktop bridge process running on the user's computer
- An optional remote relay service for cross-network access

The user primarily uses Codex CLI on their computer, not the Codex desktop app. The product should therefore be built around Codex's official app-server surface and local desktop execution, rather than private desktop-only IPC behaviors.

This project must actively reference the local Codex open-source repository at:

- `$CODEX_SOURCE_CODE_HOME` — read this value from the project root `.env` file

That repository is the authoritative implementation reference for Codex app-server capabilities, protocol behavior, session lifecycle, approvals, and related integration details.

The product must support two connection modes:

1. Local network mode, where the phone and computer are on the same LAN and no extra external service is required for message delivery.
2. Remote relay mode, where the phone and computer are on different networks and a relay service forwards traffic between them.

## Goals

- Provide a single product surface for Web and mobile access to Codex sessions.
- Support Codex session browsing, session detail viewing, live updates, message sending, interrupting, approvals, and tool/user-input responses.
- Keep Codex execution on the user's computer at all times.
- Allow fast reconnection and state recovery after app backgrounding or temporary disconnection.
- Maintain one repository for browser and mobile clients.
- Prefer official Codex integration points over private or unstable desktop-specific mechanisms.

## Non-Goals

- Guaranteed permanent background connectivity on iOS or Android.
- Full push-notification implementation in the initial version.
- Voice, realtime audio, camera capture, or other mobile-native heavy features.
- Support for multiple agent providers in the initial version.
- Dependence on the Codex desktop application's private IPC or window model.
- Running Codex workloads inside the relay service.

## Product Principles

- Web-first client architecture. The browser and Tauri mobile app should share the same client application code wherever possible.
- Local execution. The user's computer remains the only place where Codex actually runs.
- Secure by default. Remote control capability must never be exposed without explicit pairing and authentication.
- Resume over permanence. The product should optimize for rapid recovery after disconnect rather than pretending background connectivity is always preserved.
- Minimal platform branching. Tauri should be treated as a host container, not as the primary product architecture.

## Users and Core Scenarios

### Primary user

- A developer running Codex CLI on their computer who wants to continue monitoring and interacting with Codex from a phone or browser.

### Core scenarios

- Open the app and view recent Codex threads grouped by workspace or project.
- Open a thread and watch live agent progress and streamed assistant output.
- Send a new message to an existing thread.
- Interrupt an in-progress turn.
- Approve or deny pending command/file/permission requests.
- Answer pending tool user-input prompts.
- Switch between local network access and remote relay access without changing the UI model.
- Reopen the app after backgrounding and quickly restore the thread list and active thread state.

## Functional Requirements

### Session and thread capabilities

- List available Codex threads.
- Read a thread summary without loading full history by default.
- Open a thread detail view with turns and items.
- Show whether a thread is active, idle, waiting on approval, or waiting on user input.
- Refresh thread state after reconnect.

### Live updates

- Stream assistant message deltas and item lifecycle updates.
- Surface thread status changes and turn completion.
- Surface pending approval and pending user-input state.
- Recover from stream interruption by re-reading authoritative thread state.

### User actions

- Send a message to a thread.
- Start a new thread.
- Interrupt an in-progress turn.
- Submit command approval decisions.
- Submit file-change approval decisions.
- Submit permission/user-input responses.

### Connectivity modes

- Local network mode:
  - The client connects directly to a bridge running on the user's computer.
  - Pairing must happen without requiring an external server.
- Remote relay mode:
  - The computer bridge maintains an outbound connection to a relay service.
  - The client connects to the relay and is routed to the bridge after authentication.

### Recovery behavior

- If the app backgrounds or loses network, the user must be able to reconnect without losing access to recent state.
- After reconnect, the client must:
  - restore the thread list
  - restore the selected thread when possible
  - rehydrate current pending approval and user-input state
  - re-establish live streaming

## User Experience Requirements

- The browser client and mobile app should feel like the same product, not two separate implementations.
- The product should clearly indicate connection mode:
  - local
  - remote relay
  - reconnecting
  - disconnected
- If real-time streaming is interrupted, the UI should communicate that it is resyncing rather than silently appearing stale.
- Pending approvals and pending user input should be visible at the thread level and within thread detail.

## System Overview

The system consists of four logical components:

### 1. Client

A shared Web application that runs:

- in the browser
- inside a Tauri 2 mobile shell

Responsibilities:

- render thread list and thread detail
- manage local UI state
- maintain authenticated session with bridge or relay
- subscribe to event stream
- submit user actions

### 2. Desktop Bridge

A local process running on the user's computer.

Responsibilities:

- manage the local connection to Codex app-server
- expose a client-facing API for Web/mobile
- normalize thread, turn, item, and pending-request state
- handle pairing and device trust
- serve as the authority for session recovery
- optionally register with the relay in remote mode

### 3. Codex app-server

The official Codex integration point used by the bridge.

Responsibilities:

- provide thread APIs
- provide turn APIs
- provide event notifications
- provide approval and user-input request/response workflows

### 4. Relay Service

An optional remote service used only for cross-network routing.

Responsibilities:

- authenticate clients and bridges
- maintain tunnel/session routing metadata
- forward authenticated traffic
- avoid executing Codex logic directly

## Security Requirements

### General

- All control-plane traffic must require explicit authentication.
- No unauthenticated read or write API may be exposed.
- Pairing must be explicit and revocable.
- Device trust state must be inspectable and removable by the user.

### Local mode

- Pairing should use a one-time code, QR code, or equivalent explicit enrollment step.
- The bridge must not accept arbitrary LAN clients without pairing.

### Remote mode

- The bridge must initiate outbound connectivity to the relay when possible.
- The relay must not gain authority to execute Codex actions independently.
- Relay-issued access must be scoped to a user/device/session.

### Debug data

- Internal traces, raw protocol messages, and similar sensitive diagnostic data must not be exposed by default in production.
- Any diagnostic surfaces must be privileged, gated, and removable.

## Reliability Requirements

- The system must tolerate app backgrounding and temporary disconnects.
- The bridge should remain the authoritative synchronization point.
- The client should not depend on uninterrupted mobile background execution.
- Reconnection should prefer re-reading current authoritative state over trusting stale local state indefinitely.

## Compatibility Constraints

- The product must work for users whose primary workflow is Codex CLI.
- The bridge must integrate with official Codex app-server behavior rather than a private desktop-only protocol.
- The shared client must be able to run without Tauri-only APIs for its core operation.

## Risks

### Product risks

- Users may expect permanent mobile background connectivity, which mobile platforms do not reliably allow.
- Users may expect push notifications early, which may require later native-specific work.

### Technical risks

- Codex app-server websocket transport is experimental, so the bridge should minimize unnecessary dependence on remote direct app-server exposure.
- Tauri 2 mobile may require platform-specific handling for lifecycle edges.
- Relay design can become security-sensitive quickly if authentication and device binding are under-specified.

## Open Design Decisions Captured For Planning

- The bridge is the required local authority and not optional.
- The relay is optional in deployment but first-class in architecture.
- Shared client code is preferred over separate Web and mobile UIs.
- "Disconnect and recover quickly" is the official reliability target.

## Acceptance Criteria

- A technical plan exists that defines:
  - repository structure
  - module responsibilities
  - local and remote connection flows
  - pairing and authentication model
  - event streaming and recovery strategy
  - MVP scope and phased rollout
- The plan must support implementation without relying on private Codex desktop IPC.
- The resulting system design must clearly explain how the same client codebase serves both browser and Tauri mobile app targets.
