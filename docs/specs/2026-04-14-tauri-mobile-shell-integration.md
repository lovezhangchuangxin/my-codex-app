# Tauri Mobile Shell Integration Spec

## Relationship To Existing Docs

This spec implements the next major platform milestone after the current local
Web-first bridge/client baseline and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-10-client-frontend-rebuild.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-13-project-centered-threads-home.md`
- `docs/specs/2026-04-13-client-modular-refactor.md`

This slice does not change:

- bridge to Codex app-server integration semantics
- thread, turn, request, or reconnect lifecycle semantics
- relay architecture
- the current browser-first requirement for `apps/client`

## Background

The repository now has a substantial local-direct product slice:

- shared protocol and SDK layers
- bridge-authenticated local pairing
- explicit reconnect and resync behavior
- a mobile-first shared client UI
- project-centered thread browsing and thread detail workflows

This spec was written when the Tauri 2 mobile host was still missing. The
current repository now includes a working host shell, but the product still
needs follow-up release hardening and broader native-device validation.

The core architectural problem captured by this spec remains the same: the
shared client cannot assume the page origin identifies the computer running the
bridge once it is embedded in a mobile host.

That assumption works when the user opens the client from the computer that runs
the bridge or from a LAN-served Web page:

- `window.location.hostname` matches the computer running the bridge

That assumption does not hold once the same client is embedded inside a mobile
Tauri shell:

- the mobile app bundle runs locally on the phone
- the embedded page origin no longer identifies the computer that runs the
  bridge
- the user therefore needs an explicit bridge target configuration for local
  direct mode

This means Tauri integration is not just “add `src-tauri/`”. The smallest
coherent implementation must introduce a host shell and a host-aware bridge
target layer while keeping the existing client business logic shared.

## Goals

- Add a Tauri 2 mobile host shell without creating a second UI codebase.
- Keep `apps/client` as the only front-end business/UI implementation.
- Isolate Tauri-specific behavior behind small host/platform adapters.
- Make local-direct bridge targeting explicit so the mobile shell can connect to
  a bridge running on another device on the LAN.
- Preserve the existing browser experience:
  - browser remains first-class
  - current LAN-hosted browser usage continues to work by default
- Keep current pairing, session, reconnect, project, and thread flows intact on
  top of the new host-aware target model.

## Non-Goals

- Relay mode implementation or relay authentication.
- Tauri-native secure storage plugins in this slice.
- Push notifications, background execution guarantees, deep links, or native
  mobile integrations beyond the host shell itself.
- Moving SDK runtime logic or thread/domain behavior into Tauri commands.
- Rewriting the client router or replacing the existing browser-first build.

## Scope

### In Scope

- a new `apps/mobile` package that hosts a Tauri 2 project
- Tauri configuration that reuses `apps/client` for dev and build assets
- a client-side host runtime abstraction under `apps/client/src/platform/`
- explicit bridge target storage and resolution
- pairing and connection UI updates needed to configure the bridge target
- target-scoped session credential storage so multiple bridge targets do not
  share one credential namespace
- disabling or bypassing PWA-only behavior inside the Tauri host
- host-aware device labeling so paired Tauri devices do not present themselves
  as Safari/Chrome browser tabs

### Out Of Scope

- secure credential storage migration from Web storage to native mobile storage
- mobile platform project initialization output such as generated Android/iOS
  native folders committed by `tauri android init` or `tauri ios init`
- native command surfaces for bridge discovery, QR scanning, or local network
  scanning
- changes to bridge HTTP/SSE protocol shape
- fully hardened release packaging policy for every mobile target

## Product Model

## Shared Client Rule

`apps/client` remains the shared application surface used by:

- browser
- Tauri mobile host

The Tauri shell may package the client and provide host-specific environment
information, but it must not become a second application architecture.

## Host Responsibilities

The Tauri host is responsible for:

- packaging and launching the shared client
- passing host runtime context into the client build
- optionally becoming the future integration point for secure storage or
  deep-link handling

The Tauri host is not responsible for:

- thread state logic
- reconnect logic
- pairing/session workflow semantics
- request handling logic
- bridge protocol behavior

## Bridge Target Model

The client must support one explicit current bridge target base URL.

Resolution order:

1. user-configured stored bridge target
2. environment override such as `VITE_BRIDGE_BASE_URL`
3. browser-derived fallback from `window.location.hostname` for normal hosted
   Web usage

In practice this means:

- browser LAN usage keeps working without extra setup
- Tauri mobile can persist and reuse a chosen bridge target
- switching between targets becomes explicit rather than implicit

## Session Credential Model

Bridge session credentials must be scoped by bridge target base URL.

Reason:

- credentials issued by one bridge should not be reused against another bridge
- switching bridge targets must not silently carry over mismatched device
  sessions
- future Tauri-native secure storage can keep the same per-target contract

## User Experience Requirements

### Pairing

The unpaired screen must allow the user to:

- specify or edit the current bridge target base URL
- verify bridge reachability
- enter the pairing code
- complete pairing against the selected bridge target

The default experience should remain lightweight:

- hosted browser usage may start with a sensible prefilled target
- Tauri mobile may start with a stored target or a generic default that the
  user can edit

### Connection Settings

The shared settings surface must expose the current bridge target and allow the
user to update it.

Changing the bridge target must:

- rebuild the bridge client/runtime around the new target
- use that target’s own credential namespace
- preserve browser-first behavior

### Tauri Host Behavior

Inside the Tauri host:

- PWA-specific update prompts and development service-worker cleanup should not
  run
- device labels should read as an app-hosted client, not a browser tab

## Architecture Decisions

## Decision 1: Use a dedicated `apps/mobile` host package

The Tauri host should live in a separate package instead of mixing Rust/mobile
host files directly into `apps/client`.

Reason:

- `apps/client` must remain a normal browser app
- host shell concerns should stay physically separate from shared client code
- the repository structure becomes clearer:
  - `apps/client` is the shared front-end
  - `apps/mobile` is the Tauri host wrapper

## Decision 2: Add client-side host adapters, not Tauri-owned business logic

Host differences should be represented in `apps/client/src/platform/` and
consumed by the existing client.

Expected host-aware concerns for this slice:

- host runtime detection
- whether PWA behavior is enabled
- bridge target defaulting
- host-flavored device labeling

## Decision 3: Keep bridge target configuration client-side for MVP

The bridge target base URL should be configured in the shared client and stored
locally on the device.

Reason:

- the Tauri host must be able to connect to a bridge on another machine
- the existing bridge protocol does not currently provide discovery
- this is the smallest coherent way to make the mobile shell usable now

## Compatibility Requirements

- `apps/client` must still run in a normal browser without Tauri APIs.
- Existing browser local-direct usage should continue to resolve the bridge
  target automatically when no explicit override is configured.
- The shared runtime must remain usable without any Tauri command invocation.
- The resulting structure must leave room for a later Tauri-native secure
  storage adapter without changing the higher-level session model again.

## Acceptance Criteria

- A new Tauri host package exists under `apps/mobile`.
- The Tauri host is configured to reuse `apps/client` as its frontend.
- The shared client has a host runtime abstraction instead of scattering Tauri
  checks through feature code.
- The shared client supports an explicit stored bridge target base URL.
- Pairing and settings UI allow the user to inspect and update the bridge
  target.
- Session credentials are stored per bridge target rather than one global key.
- The root verification path includes a mobile-host check so host drift is less
  likely to land unnoticed.
- Current Android local-direct builds remain compatible with HTTP LAN bridge
  targets used by the bridge today.
- Browser builds continue to typecheck and build successfully.
- Tauri-specific behavior remains limited to host concerns.

## Risks

### Risk: mobile host wraps the UI but cannot connect to a bridge

Mitigation:

- make bridge target configuration part of the same milestone

### Risk: Tauri-specific conditionals spread through feature code

Mitigation:

- centralize host decisions under `apps/client/src/platform/`

### Risk: adding a mobile package breaks current root scripts

Mitigation:

- update workspace/root scripts deliberately so current browser/bridge checks
  remain stable even when native mobile toolchains are not installed

### Risk: future secure storage work requires another session rewrite

Mitigation:

- introduce explicit credential-store and bridge-target seams now
