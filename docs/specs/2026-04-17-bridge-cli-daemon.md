# Bridge CLI And Daemon Spec

## Background

This project needs a user-facing bridge product, not just a development server.
The bridge should be a standalone npm package that installs a standalone
command-line daemon. It should:

- runs on the user's computer
- talks to upstream `codex app-server`
- exposes the client-facing HTTP + SSE API
- manages pairing, trusted devices, and project registry state

The frontend is separate. Users install the Tauri 2 app package independently
and connect that frontend to the bridge over the network. The bridge must not:

- launch the frontend
- host frontend assets
- depend on a browser tab or browser origin as part of its startup path

The current `apps/bridge` implementation already contains the service logic,
but it is still exposed as a foreground development process. This milestone
formalizes it as an installable npm CLI/daemon product.

## Relationship To Existing Docs

This spec stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-13-bridge-modular-refactor.md`
- `docs/specs/2026-04-14-tauri-mobile-shell-integration.md`

It narrows the deployment and lifecycle model for the bridge without changing
the shared client architecture or the upstream Codex integration model.

## Goals

- Provide a standalone bridge CLI that users can install and run directly.
- Publish the bridge as `@my-codex-app/bridge` on npm so users can install it
  globally with `npm` or `pnpm`.
- Support one-command background startup of the bridge service.
- Expose a complete admin surface for status, logs, config, pairing, devices,
  projects, and diagnostics.
- Keep bridge state, logs, and config under OS application directories instead
  of the current working directory.
- Make frontend/bridge version compatibility explicit and machine-checkable.
- Keep the bridge entirely frontend-agnostic.

## Non-Goals

- Hosting, serving, or opening the frontend from the bridge.
- Browser-app startup orchestration.
- Relay implementation.
- Self-updating or auto-patching the bridge executable.
- System service installation as a hard requirement for v1.
- Requiring a developer source checkout or `.env` runtime dependency for users.
- Migrating any old repo-local bridge state; this milestone assumes no prior
  user data exists.
- Changing Codex app-server semantics.

## Product Model

### Bridge daemon

The bridge daemon is the local authority for a single default per-user profile
instance. It is responsible for:

- upstream `codex app-server` communication
- pairing and device trust
- session tokens and refresh flow
- bridge-side thread, project, and request state
- HTTP + SSE exposure for clients
- writing a runtime manifest that CLI invocations can use to discover the live
  daemon

### Bridge CLI

The bridge CLI is the user-facing management surface for the daemon.
This spec refers to the executable as `codexb`.
The npm package name is `@my-codex-app/bridge`.

### Frontend

The frontend is a separately installed Tauri 2 app package. It connects to the
bridge using an explicit bridge target URL and never depends on the bridge to
host UI assets.

## User Experience Requirements

- `codexb start` must start the daemon in the background and return
  only after the service is reachable.
- `codexb run` must run the service in the foreground for debugging.
- `codexb status` must show whether the daemon is running, where it is
  listening, and whether pairing is required.
- `codexb logs` must provide diagnostic logs without exposing secrets
  by default.
- `codexb start` must print the bridge address and pairing payload,
  not a frontend link.
- `codexb pair show` must print the current pairing code and QR data
  when pairing is required, along with the bridge address and a bridge-
  independent pairing payload.
- when a live daemon is running, `codexb pair show` must reflect the daemon's
  public pairing state and surface an explicit error if that state cannot be
  read
- `codexb doctor` must explain missing prerequisites, invalid config,
  port conflicts, and upstream Codex availability.
- The Tauri frontend must be able to connect without the bridge launching or
  serving any UI.

## Command Model

The bridge CLI should provide the following command families:

| Command           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `start`           | Start the daemon in the background            |
| `run`             | Run the daemon in the foreground              |
| `stop`            | Stop a running daemon                         |
| `restart`         | Restart the daemon                            |
| `status`          | Show runtime and health status                |
| `logs`            | View or tail the daemon log                   |
| `doctor`          | Check prerequisites and configuration         |
| `version`         | Show bridge, protocol, and build version data |
| `pair show`       | Display pairing state, code, and QR output    |
| `pair refresh`    | Rotate the pairing challenge                  |
| `devices list`    | Show trusted devices                          |
| `devices revoke`  | Revoke a trusted device                       |
| `devices delete`  | Delete a revoked device record                |
| `config show`     | Show resolved config                          |
| `config get`      | Read a single config value                    |
| `config set`      | Update a config value                         |
| `config edit`     | Open the config file in an editor             |
| `config reset`    | Reset config to defaults                      |
| `projects list`   | List imported projects                        |
| `projects import` | Import a project path                         |
| `projects remove` | Remove an imported project                    |
| `completion`      | Generate shell completion scripts             |

Commands that are intended for automation should support `--json`.
The daemon should expose a runtime manifest in the user data directory so fresh
CLI invocations can locate the running instance deterministically.

## Configuration And State Model

The daemon must use explicit config and state directories. It must not use the
current working directory for durable data.
The runtime root should live under the user's home directory, rooted at
`.my-codex-app/bridge`.

Example layout:

- `~/.my-codex-app/bridge/config.json`
- `~/.my-codex-app/bridge/runtime.json`
- `~/.my-codex-app/bridge/state.json`
- `~/.my-codex-app/bridge/logs/bridge.log`

On Windows, the same structure should live under the user's profile directory
using the platform-appropriate home path.

### Resolution order

1. CLI flags
2. Config file
3. Environment variables
4. Built-in defaults

### Config scope

The bridge should support separate values for:

- listen host and port
- advertised bridge URL
- allowed CORS origins
- config directory
- state directory
- log file path
- thread unsubscribe grace window

### Durable state

At minimum, the daemon must persist:

- device trust and session auth state
- project registry state
- daemon lock or pid metadata
- log output

### Version compatibility

The bridge must expose version metadata that the frontend can query before or
during connection setup. A frontend should be able to detect incompatible major
versions and show a clear error instead of failing silently.
This compatibility check should happen on the normal frontend connection path
before thread bootstrap, and also before completing pairing against a selected
bridge target so an incompatible bridge fails early.
At minimum, version metadata should include the bridge package version and the
bridge/client protocol version.
The bridge must expose a public read-only `GET /api/version` endpoint for this
purpose, and `GET /healthz` must remain public for reachability checks.

## Security Requirements

- No unauthenticated control API may be exposed.
- Public read-only bootstrap endpoints (`/healthz`, `/api/version`) are
  allowed and must not expose secrets.
- Pairing codes, refresh tokens, and access tokens must not be written to logs
  by default.
- `status` and `version` must be safe for normal operator use.
- `pair show` is the explicit path for recovering pairing data.
- CORS must be configurable and should not depend on a hosted UI origin.

## Compatibility Requirements

- The bridge must remain compatible with the existing shared client runtime.
- The Tauri frontend is the supported packaged client target for this
  milestone.
- Browser-hosted use may remain possible through the shared client runtime, but
  the bridge does not package or depend on it.
- The CLI must not require Tauri-specific APIs.

## Acceptance Criteria

- A user can install `@my-codex-app/bridge` globally with `npm` or `pnpm` and
  run `codexb`.
- `codexb start` starts a background daemon without launching any UI.
- `codexb status` and `codexb logs` work against a running
  daemon.
- `codexb pair show` returns the current pairing state without using a
  frontend and shows the bridge address plus QR payload.
- `codexb pair show` reports a clear error if a running daemon cannot serve its
  public pairing state.
- The frontend can connect to the daemon using an explicit bridge URL.
- Bridge state survives restarts and is stored outside the repository tree.
- Version incompatibility between bridge and frontend is reported clearly
  before normal thread bootstrap or pairing completion continues.
- No bridge command depends on the bridge hosting or opening a UI.
