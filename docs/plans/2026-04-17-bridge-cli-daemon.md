# Bridge CLI And Daemon Technical Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-17-bridge-cli-daemon.md`

It also stays aligned with the existing platform, auth, reconnect, and Tauri
frontend specs.

## Delivery Strategy

Recommended implementation mode:

- main agent execution

Reason:

- the work is concentrated in `apps/bridge` with a small number of supporting
  protocol and client updates
- the main risk is semantic drift in lifecycle/state behavior, not parallelism

## Design Summary

The bridge should be refactored from a foreground server process into a
standalone CLI/daemon product with three explicit surfaces:

1. a command dispatcher for lifecycle and admin commands
2. a daemon runtime for HTTP/SSE, auth, and persistent state
3. a typed status/version surface for the separate frontend

The bridge must not start the frontend. The frontend remains a separately
installed Tauri 2 app that connects to the bridge by URL.

## Target Module Layout

The implementation should move toward a structure like this:

```text
apps/bridge/src/
  cli/
    index.ts
    commands/
      start.ts
      run.ts
      stop.ts
      restart.ts
      status.ts
      logs.ts
      doctor.ts
      version.ts
      pair.ts
      devices.ts
      config.ts
      projects.ts
  daemon/
    paths.ts
    lock.ts
    process.ts
    runtimeManifest.ts
    logging.ts
  server/
    bridgeServer.ts
    config.ts
    http.ts
    logging.ts
    threadEventStreamRegistry.ts
  auth/
  projects/
  threads/
  appServerClient.ts
  server.ts
```

Exact filenames may vary, but the responsibilities above should remain stable.

## Module Changes

### `apps/bridge/package.json`

Add:

- a publishable npm package `@my-codex-app/bridge`
- public unscoped npm package metadata suitable for global install and
  non-private packaging
- a `bin` entry for the `codexb` executable
- scripts for `build`, `dev`, `start`, `doctor`, and packaging validation
- a clean separation between foreground runtime and CLI entrypoint

### `apps/bridge/src/server.ts`

Reduce the current entry file to a service composition root that:

- loads config and paths
- initializes the upstream app-server client
- constructs auth, thread, project, and workspace services
- starts the daemon HTTP server
- wires shutdown handling

### `apps/bridge/src/cli/*`

Add the bridge command dispatcher and subcommand handlers.
The command layer should:

- parse flags and subcommands
- resolve config/state paths
- invoke daemon start/stop/status operations
- call pairing, device, config, and project admin APIs
- print human output and JSON output consistently
- resolve the live daemon from the runtime manifest before issuing `status`,
  `stop`, `restart`, or `pair show`
- confirm health with public `GET /healthz` and version compatibility with
  public `GET /api/version`
- use the runtime manifest to locate the daemon, then call public
  `GET /api/pairing` for `pair show`
- fail closed for `pair show` when a live daemon is present but its public
  pairing status cannot be read, instead of silently falling back to local
  auth state

### `apps/bridge/src/daemon/*`

Add process and filesystem helpers for:

- config/state directory resolution
- daemon lock or pid management
- background process spawning
- log file capture and tailing
- runtime manifest read/write helpers so fresh CLI invocations can discover the
  live daemon deterministically
- a runtime manifest containing the daemon pid, host, port, bridge URL, config
  path, state path, log path, and start timestamp

### `packages/protocol`

Add typed responses for:

- bridge version metadata
- daemon status metadata

The frontend should be able to read these values without relying on ad hoc text
parsing.
The public bootstrap endpoint should be a typed `GET /api/version` response,
and `GET /healthz` should remain the reachability probe.
At minimum, the version payload should carry the bridge package version and the
bridge/client protocol version.

### `apps/client` and `apps/mobile`

Add only the minimal compatibility work needed for the separate frontend to
consume the bridge product cleanly:

- bridge version compatibility check during runtime bootstrap/reconnect and
  before pairing completion
- bridge status display
- continued explicit bridge-target selection

No frontend-startup orchestration should be added to the bridge.

## Phase Breakdown

### Phase 1: Define the CLI contract

Goal:

- establish the user-facing command tree and runtime contract before moving
  process logic

Changes:

- add a CLI entrypoint for `codexb`
- define command dispatch for `start`, `run`, `stop`, `restart`, `status`,
  `logs`, `doctor`, `version`, `pair`, `devices`, `config`, `projects`, and
  `completion`
- add typed bridge version and status responses in `packages/protocol`
- add public bridge version reporting in the HTTP server
- define the runtime manifest schema that the CLI uses for daemon discovery
  and command routing

Validation after phase:

- bridge typecheck
- command help output review

### Phase 2: Build daemon lifecycle and persistent state

Goal:

- make the bridge a reliable background service without tying it to a frontend

Changes:

- move durable state out of `process.cwd()`
- introduce explicit config and state directories
- create the per-user runtime root under the home directory
- add daemon lock or pid handling
- implement background `start` and foreground `run`
- implement `stop`, `restart`, `status`, and `logs`
- write the runtime manifest at daemon startup
- have fresh CLI invocations read the runtime manifest before issuing control
  commands
- keep pairing state retrievable without reading logs

Validation after phase:

- `codexb start` launches a background daemon
- `codexb status` reports the live service
- `codexb stop` shuts the daemon down cleanly

### Phase 3: Implement admin commands

Goal:

- expose bridge administration without creating a second UI surface

Changes:

- implement `pair show` and `pair refresh`
- implement `devices list`, `devices revoke`, and `devices delete`
- implement `config show`, `config get`, `config set`, `config edit`, and
  `config reset`
- implement `projects list`, `projects import`, and `projects remove`
- implement `doctor` with upstream Codex and configuration checks
- ensure `--json` works for automation-friendly commands
- have `pair show` fetch the current pairing state from public `GET
/api/pairing` using the bridge URL from the runtime manifest and render the
  same bridge URL + payload used in the terminal QR output
- when a live daemon exists, have `pair show` surface `/api/pairing` read
  failures directly rather than silently falling back to local state

Validation after phase:

- command-by-command smoke tests
- verify secrets are not leaked through normal output

### Phase 4: Package and document

Goal:

- make the bridge product consumable as a real installable tool

Changes:

- publish `@my-codex-app/bridge` to npm
- document global install commands such as `npm i -g @my-codex-app/bridge`
  and `pnpm add -g @my-codex-app/bridge`
- confirm the bridge package does not depend on frontend build artifacts
- update the user-facing docs to use the bridge CLI installation/startup flow
- update the frontend docs to describe connection to a separately installed
  bridge

Validation after phase:

- install/build review
- final doc consistency review

## Verification Plan

Minimum required verification:

- `pnpm --filter @my-codex-app/bridge typecheck`
- `pnpm --filter @my-codex-app/bridge test`
- `npm pack --dry-run` for the bridge package
- global install smoke test with `npm i -g @my-codex-app/bridge` or
  `pnpm add -g @my-codex-app/bridge` in a temporary prefix
- CLI smoke test for `start`, `status`, `pair show`, `doctor`, and `stop`
- frontend connection smoke test against the running bridge and `GET /api/version`
- packaged Tauri frontend smoke test against a published bridge build
- pairing smoke test against an intentionally incompatible bridge protocol
  version response to confirm the client fails before pairing completion

Review checklist:

- confirm the bridge never starts or serves the frontend
- confirm persistent state is stored outside the repo tree
- confirm fresh CLI invocations discover the live daemon through the runtime
  manifest
- confirm pairing data is available through explicit commands, not log scraping
- confirm version metadata is exposed for frontend compatibility checks
- confirm frontend compatibility checks run before thread bootstrap and before
  pairing completion
- confirm the bridge still talks to upstream `codex app-server` the same way

## Risks And Mitigations

### Risk: the CLI becomes a second UI

Mitigation:

- keep the command set focused on lifecycle, config, diagnostics, and admin
- avoid adding thread/chat workflow commands beyond bridge administration

### Risk: background startup becomes fragile

Mitigation:

- use a daemon lock or pid file
- make `start` wait for health before returning success
- keep `run` as the simple foreground path

### Risk: pairing data leaks into logs

Mitigation:

- keep pairing code retrieval explicit through `pair show`
- redact sensitive fields from normal logs and `status`

### Risk: frontend and bridge drift apart

Mitigation:

- expose version metadata from the bridge
- have the frontend check compatibility before or during connect
- keep protocol changes typed in `packages/protocol`
