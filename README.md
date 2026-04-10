# My Codex App

My Codex App is a single-repository project for accessing Codex from:

- a browser
- a Tauri 2 mobile app

## Background

This project exists because Codex is primarily used on a computer, while the user also wants to:

- monitor Codex sessions from a phone
- read live progress and messages away from the computer
- respond to approvals and tool/user-input requests remotely
- continue using the same product from both a browser and a mobile app

The user's primary workflow is based on Codex CLI running on their computer, not the Codex desktop app. Because of that, this project is designed around a local desktop bridge that connects to Codex on the computer and exposes a controlled client-facing surface for Web and mobile use.

The product is intended to support two access modes:

- local network direct access when the phone and computer are on the same LAN
- remote relay access when they are on different networks

The product is designed around a local desktop bridge that connects to Codex running on the user's computer, with support for:

- local network direct access
- remote relay access across networks

Codex execution stays on the user's computer. This repository will contain the shared client, bridge, relay, and protocol layers needed to make that work.

For upstream Codex integration behavior, this project references:

- `~/Desktop/projects/sources/codex`

## Current bootstrap

The current repository bootstrap implements the first local bridge/client slice from the plan:

- `packages/protocol`: typed bridge/client contracts for thread reads, writes, pending-request responses, and live events
- `packages/sdk`: shared browser-first bridge transport plus thread state/live merge runtime, including pending-request state
- `apps/bridge`: a local bridge that starts `codex app-server`, initializes it over stdio JSON-RPC, exposes `GET /api/threads`, `GET /api/threads/:threadId`, `GET /api/events`, and write-path APIs for `thread/start`, `turn/start`, `turn/interrupt`, and `request/respond`
- `apps/client`: a browser-first React app rebuilt on a standard Vite React + TypeScript scaffold with Tailwind CSS and shadcn, including:
  - route-based `Threads`, `Inbox`, and `Connection` surfaces
  - desktop split-view and mobile-first thread detail navigation
  - thread list, thread detail, composer, and interrupt flows
  - aggregated pending-request handling for command, file-change, permission, and tool user-input prompts
  - bridge diagnostics and health checks through the shared SDK/runtime layer

This is intentionally still a thin end-to-end flow centered on `thread/list`, `thread/read`, `thread/start`, `turn/start`, `turn/interrupt`, `request/respond`, and a minimal live event bridge for the selected thread. Pairing, reconnect hardening, Tauri shell integration, and relay support are still pending.

## Client implementation status

The current client implementation is no longer the original hand-assembled prototype. It now uses:

- the official Vite React + TypeScript project structure
- route-based navigation via React Router
- Tailwind CSS for app styling
- shadcn CLI-generated UI primitives

The shared client runtime still remains in `packages/sdk`, so bridge transport and live thread state are not duplicated across UI components.

## Local bootstrap auth

Current bridge bootstrap requires an explicit shared access token on every client-to-bridge request.

- bridge env: `BRIDGE_ACCESS_TOKEN`
- client env: `VITE_BRIDGE_ACCESS_TOKEN`

Requests can authenticate with:

- `Authorization: Bearer <token>`
- or `access_token=...` query params for browser/EventSource bootstrap

This is a temporary bootstrap mechanism for local development until explicit pairing and revocable device trust are implemented.
