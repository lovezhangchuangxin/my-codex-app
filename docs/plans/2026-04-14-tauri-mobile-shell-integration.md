# Tauri Mobile Shell Integration Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-14-tauri-mobile-shell-integration.md`

It also remains aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-13-project-centered-threads-home.md`
- `docs/specs/2026-04-13-client-modular-refactor.md`

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- the work crosses docs, shared client runtime bootstrapping, connection UI, and
  a new Tauri host package
- the critical path is the shared host/target model, which is tightly coupled
- the user did not request delegated/sub-agent execution

## Current Status

This plan is now implemented for the working development-path baseline.

Implemented:

- `apps/mobile` Tauri host package
- shared client host runtime abstraction
- explicit bridge target configuration in pairing and settings
- target-scoped session credential storage
- root verification that includes a mobile-host `cargo check`

Still intentionally deferred beyond this plan:

- broader release hardening and native-device validation
- Tauri-native secure storage

## Design Summary

The smallest coherent implementation is:

1. add a dedicated `apps/mobile` Tauri host package
2. keep `apps/client` as the only shared front-end codebase
3. introduce a host runtime abstraction and explicit bridge target store in the
   shared client
4. make pairing and settings use the bridge target explicitly
5. scope stored session credentials by bridge target

This avoids a second UI codebase while solving the main issue that blocks a real
mobile host:

- a packaged mobile app cannot infer the computer bridge URL from the page
  origin

## Module Changes

## `docs/`

Add:

- `docs/specs/2026-04-14-tauri-mobile-shell-integration.md`
- `docs/plans/2026-04-14-tauri-mobile-shell-integration.md`

Update later if implementation completes cleanly:

- `README.md`
- `TODO.md`

## `apps/client`

### New host/platform layer

Add a small host abstraction area:

- `src/platform/host.ts`

Responsibilities:

- expose host runtime kind such as `web` or `tauri`
- expose booleans like `supportsPwa`
- provide host-aware helpers for device labeling or other lightweight decisions

### New bridge target storage/resolution

Add a small bridge target module, for example:

- `src/lib/runtime/bridge-target-store.ts`

Responsibilities:

- normalize a bridge base URL
- load/save the preferred bridge target
- resolve the effective current bridge target using:
  - stored target
  - `VITE_BRIDGE_BASE_URL`
  - browser hostname fallback

### Runtime provider changes

Update:

- `src/lib/runtime/runtime-provider.tsx`

Changes:

- build the bridge client/runtime from the resolved bridge target at startup
- keep runtime bootstrap/retry behavior unchanged
- rely on explicit full-page reload after target changes so the existing
  browser-first runtime reinitializes against the new target

### Credential store changes

Update:

- `src/lib/runtime/bridge-credential-store.ts`

Changes:

- namespace stored bridge session credentials by normalized bridge target URL
- keep the current browser storage implementation for now
- preserve the same `BridgeCredentialStore` contract expected by the SDK

### Pairing and settings UI

Update:

- `src/components/pairing/pairing-screen.tsx`
- `src/components/pairing/device-info.ts`
- `src/components/settings/connection-section.tsx`

Changes:

- pairing screen gets a bridge target input
- bridge health check uses the entered/effective target
- pairing completion stores credentials under the selected target namespace
- device info uses host-aware labeling:
  - browser remains browser-flavored
  - Tauri mobile reads as an app-hosted client
- connection settings allows updating the bridge target explicitly

### PWA/Tauri compatibility

Update:

- `src/app/providers.tsx`

Changes:

- disable PWA-only logic inside the Tauri host:
  - update prompt
  - dev service-worker cleanup

### Environment helpers

Update:

- `src/lib/env.ts`

Changes:

- keep exporting lightweight env helpers such as `bridgeBaseUrl`
- change bridge URL resolution so it now flows through the new target-store
  layer instead of assuming page-origin hostname is always correct

## `apps/mobile`

Add a dedicated Tauri host package:

- `apps/mobile/package.json`
- `apps/mobile/src-tauri/Cargo.toml`
- `apps/mobile/src-tauri/build.rs`
- `apps/mobile/src-tauri/src/lib.rs`
- `apps/mobile/src-tauri/src/main.rs`
- `apps/mobile/src-tauri/tauri.conf.json`
- `apps/mobile/src-tauri/capabilities/default.json`

### Host package responsibilities

- run the shared client dev server in development
- point Tauri at the shared client build output in production
- define the Tauri app identity and native entry point
- keep Android local-direct HTTP compatibility aligned with the current bridge
  transport until HTTPS or an equivalent alternative exists

### Planned config shape

Use the official Tauri/Vite pattern:

- `beforeDevCommand` runs the shared client dev server
- `beforeBuildCommand` runs the shared client build
- `devUrl` points at the shared client Vite dev server
- `frontendDist` points at the shared client build output relative to
  `src-tauri/`

Also set a client env marker such as `VITE_HOST_RUNTIME=tauri` for mobile-hosted
builds/dev.

Implementation note:

- current Android generated Gradle files require a small post-generation patch
  so release builds keep `usesCleartextTraffic=true` for the repository's
  present local-direct HTTP bridge model
- this is currently handled by `apps/mobile/scripts/ensure-android-local-direct.mjs`

## Root Workspace Scripts

Update root `package.json` scripts so the existing browser/bridge checks keep
working even though the mobile package requires native tooling not present in
every environment.

Recommended direction:

- keep browser/bridge build behavior intact
- include a lightweight mobile-host verification step in default root scripts
- keep heavier native mobile commands separate from the default root path

## Implementation Order

1. Add spec and plan docs.
2. Add host runtime helper(s) under `apps/client/src/platform/`.
3. Add bridge target storage and normalization helpers.
4. Refactor target resolution and credential storage so startup uses the current
   bridge target and target-scoped session namespace.
5. Update pairing and connection settings UI to read/write the bridge target.
6. Update device info and PWA gating for Tauri host awareness.
7. Add `apps/mobile` Tauri host package and config files.
8. Adjust root scripts and README/TODO wording.
9. Run focused verification for the browser/shared-client path.

## Verification Plan

Minimum required verification:

- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @my-codex-app/mobile check`

Focused manual checks:

1. Hosted browser path with no stored bridge target still resolves to the
   current hostname-based bridge URL.
2. Changing the configured bridge target rebuilds the runtime against the new
   target.
3. Pairing succeeds against the selected target and stores credentials in that
   target’s namespace.
4. Switching targets does not reuse another target’s credentials.
5. Tauri-hosted builds disable PWA-only UI/cleanup logic.
6. Android pairing/settings surfaces document emulator, LAN, and `adb reverse`
   bridge-target usage clearly.

Optional native verification if the local toolchain is available:

- inspect `pnpm --dir apps/mobile tauri info`
- initialize Android/iOS targets later with:
  - `pnpm --dir apps/mobile tauri android init`
  - `pnpm --dir apps/mobile tauri ios init`

These native steps are not required to keep the shared Web-first implementation
coherent in this slice, but should be run before declaring the mobile host fully
production-ready.

## Risks And Mitigations

### Risk: runtime recreation on target change drops useful local state

Mitigation:

- keep bridge target changes explicit and user-driven
- rely on the existing bootstrap/resync path after recreation

### Risk: browser defaults regress while making mobile work

Mitigation:

- keep browser hostname fallback in the target resolver
- verify normal browser build behavior after the refactor

### Risk: mobile package breaks monorepo commands

Mitigation:

- keep default root verification scoped to browser/bridge packages
- add dedicated mobile commands instead of folding native mobile build steps
  into the default root scripts
