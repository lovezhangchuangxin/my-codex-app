# AGENTS.md

This repository is `my-codex-app`.

## Project Purpose

This project builds a Codex access platform with:

- a shared Web client
- a Tauri 2 mobile app shell
- a desktop bridge that talks to local Codex
- an optional relay for remote access

Codex itself always runs on the user's computer.

## Upstream Reference

When implementing Codex integration behavior, always reference the local Codex source repository at:

- `~/Desktop/projects/sources/codex`
- `docs/reference/2026-04-11-codex-upstream-integration-guide.md`

That repository is the upstream authority for:

- `codex app-server` behavior
- thread and turn lifecycle
- approvals and user-input flows
- event streaming semantics
- related protocol details

If this repository's assumptions conflict with the upstream Codex source, stop and reconcile the design before coding further.

## Workflow Rules

1. Read the relevant local code, docs, and existing project files before editing.
2. For Codex integration tasks, read `docs/reference/2026-04-11-codex-upstream-integration-guide.md` before doing a fresh upstream repo sweep.
3. Prefer the smallest coherent change that advances the current milestone.
4. Keep browser and Tauri-mobile behavior aligned unless platform differences are explicitly required.
5. Keep core client logic Web-first. Do not move domain logic into Tauri-specific code without a strong reason.
6. Keep bridge-facing and relay-facing protocol definitions typed and centralized.
7. Do not introduce private Codex desktop IPC dependencies as a core architectural requirement.
8. Before finishing a task, review the changed files for consistency with the current spec and plan.

## Architecture Constraints

- The browser client and Tauri mobile app should primarily share one front-end codebase.
- The desktop bridge is the only component that should talk directly to Codex app-server.
- The relay is a routing/authentication component, not a Codex execution environment.
- "Disconnect and recover quickly" is the reliability target; do not design around guaranteed perpetual mobile background connectivity.

## Documentation Rules

- If architecture, protocol shape, or milestone scope changes, update the relevant files in `docs/specs/` and `docs/plans/`.
- Keep implementation aligned with:
  - `docs/specs/2026-04-10-codex-mobile-web-platform.md`
  - `docs/plans/2026-04-10-codex-mobile-web-platform.md`

## Coding Expectations

- Prefer clear, typed module boundaries.
- Avoid leaking transport-specific details into UI components.
- Avoid broad implicit behavior. Keep state transitions explicit.
- Treat authentication, pairing, and session recovery as first-class concerns.

## Validation Expectations

Run focused checks appropriate to the files you changed. At minimum, preserve:

- type correctness
- protocol/schema consistency
- documentation consistency

If a task introduces a new architectural assumption, document it before considering the task complete.
