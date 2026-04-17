# AGENTS.md

This repository is `my-codex-app`.

## Project Purpose

A Codex access platform with:

- a shared Web client (`apps/client`)
- a Tauri 2 mobile app shell (`apps/mobile`)
- a desktop bridge daemon (`apps/bridge`, CLI: `codexb`)
- an optional relay for remote access (not yet implemented)

Codex always runs on the user's computer. The bridge talks to it via `codex app-server` stdio JSON-RPC. Clients connect to the bridge over HTTP + SSE.

## Upstream Reference

When implementing Codex integration behavior, always reference the local Codex source repository at:

- `$CODEX_SOURCE_CODE_HOME` — read from the project root `.env` file. If missing or empty, ask the user to create `.env` (copy from `.env.example`) and set the path before continuing.
- `docs/reference/2026-04-11-codex-upstream-integration-guide.md`

That repository is the upstream authority for:

- `codex app-server` behavior
- thread and turn lifecycle
- approvals and user-input flows
- event streaming semantics
- related protocol details

If this repository's assumptions conflict with the upstream Codex source, stop and reconcile the design before coding further.

## Architecture

### Data Flow

```
Client (React)
  │  fetch / EventSource
  ▼
Bridge HTTP Server (bridgeServer.ts)
  │  request routing, auth middleware, SSE streaming
  ▼
Bridge Services (threads, projects, auth, appServerClient)
  │  stdio JSON-RPC
  ▼
codex app-server
```

### Module Map

| Module                | Key Files                                             | Responsibility                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI**               | `apps/bridge/src/cli/index.ts`                        | Command dispatch, flag parsing, help output, daemon lifecycle (`start`, `stop`, `restart`, `status`, `logs`), admin commands (`pair`, `devices`, `config`, `projects`, `doctor`) |
| **Daemon Runtime**    | `apps/bridge/src/daemon/`                             | Process management, PID lock, runtime manifest, directory resolution                                                                                                             |
| **HTTP Server**       | `apps/bridge/src/server/bridgeServer.ts`              | Request routing, auth middleware, SSE endpoint, health check                                                                                                                     |
| **Config**            | `apps/bridge/src/server/config.ts`                    | Config loading, resolution order (CLI > file > env > defaults), file read/write                                                                                                  |
| **Auth**              | `apps/bridge/src/auth/`                               | Local pairing, device trust store, session token issuance and refresh                                                                                                            |
| **App-Server Client** | `apps/bridge/src/appServerClient.ts`                  | Stdio JSON-RPC transport to `codex app-server`                                                                                                                                   |
| **Thread Events**     | `apps/bridge/src/server/threadEventStreamRegistry.ts` | SSE subscription management, event fan-out                                                                                                                                       |
| **Projects**          | `apps/bridge/src/projects/`                           | Project registry store, path normalization                                                                                                                                       |
| **Protocol Types**    | `packages/protocol/src/index.ts`                      | Shared TypeScript types for all bridge-client API shapes                                                                                                                         |
| **Client SDK**        | `packages/sdk/`                                       | Browser-first transport layer, thread state machine, live event merge                                                                                                            |
| **Client UI**         | `apps/client/src/`                                    | React app — components, hooks, state management                                                                                                                                  |
| **Mobile Shell**      | `apps/mobile/`                                        | Tauri 2 host wrapping the client, platform-specific shell code                                                                                                                   |

### Auth Model

The bridge uses local pairing with revocable device trust — no static shared tokens.

1. Bridge generates a short-lived **pairing code** (terminal/QR, valid 10 min)
2. Client completes pairing with a device identifier and human-readable label
3. Bridge stores a **trusted device record** and issues tokens:
   - **Access token** — 10 min TTL, used for API calls
   - **Refresh token** — 30 day TTL, auto-rotates to keep sessions alive
4. Devices can be revoked via CLI (`codexb devices revoke <id>`) or the Connection page

Authenticating requests:

- `Authorization: Bearer <access-token>` for HTTP APIs
- `access_token=...` query parameter for `EventSource` (SSE) subscriptions

## Workflow Rules

1. **Pre-check `CODEX_SOURCE_CODE_HOME` before any Codex-related work.** Read `.env`. If missing, stop and ask the user to create it.
2. Read relevant local code, docs, and existing files before editing.
3. For Codex integration tasks, read `docs/reference/2026-04-11-codex-upstream-integration-guide.md` before doing a fresh upstream repo sweep.
4. Prefer the smallest coherent change that advances the current milestone.
5. Keep browser and Tauri-mobile behavior aligned unless platform differences are explicitly required.
6. Keep core client logic Web-first. Do not move domain logic into Tauri-specific code without a strong reason.
7. Keep bridge-facing and relay-facing protocol definitions typed and centralized in `packages/protocol`.
8. Do not introduce private Codex desktop IPC dependencies as a core architectural requirement.
9. Before finishing a task, review changed files for consistency with the current spec and plan.
10. Run `pnpm fmt` before committing.

## Architecture Constraints

- The browser client and Tauri mobile app share one front-end codebase (`apps/client`).
- The desktop bridge is the only component that talks directly to Codex `app-server`.
- The bridge must never start, host, or serve the frontend.
- The relay is a routing/authentication component, not a Codex execution environment.
- "Disconnect and recover quickly" is the reliability target for mobile connectivity.
- Bridge state, logs, and config live under `~/.codexb/` (or OS-appropriate directory), never in the repo tree.

## Coding Expectations

- Prefer clear, typed module boundaries.
- Avoid leaking transport-specific details into UI components.
- Avoid broad implicit behavior. Keep state transitions explicit.
- Treat authentication, pairing, and session recovery as first-class concerns.
- Bridge CLI commands should support `--json` for automation.

## Validation

Run focused checks appropriate to the files you changed:

```sh
# Type-check everything
pnpm typecheck

# Type-check bridge only
pnpm --filter @my-codex-app/bridge typecheck

# Format code (required before committing)
pnpm fmt

# Run bridge tests
pnpm --filter @my-codex-app/bridge test
```

At minimum, preserve: type correctness, protocol/schema consistency, documentation consistency, and code formatting.

If a task introduces a new architectural assumption, document it in `docs/specs/` and `docs/plans/` before considering the task complete.

## Documentation Rules

- If architecture, protocol shape, or milestone scope changes, update the relevant files in `docs/specs/` and `docs/plans/`.
- Keep implementation aligned with:
  - `docs/specs/2026-04-10-codex-mobile-web-platform.md`
  - `docs/plans/2026-04-10-codex-mobile-web-platform.md`
