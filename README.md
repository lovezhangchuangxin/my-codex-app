# My Codex App

**[English](./README.md) | [中文](./README.zh.md)**

Access [Codex](https://github.com/openai/codex) from your browser and phone. Codex stays on your computer — this project adds a local bridge, shared web client, and (eventually) a Tauri mobile shell so you can monitor sessions, respond to approvals, and read live progress from any device on your network.

## Architecture

```
┌──────────────┐      局域网 / Relay      ┌──────────────────┐       stdio JSON-RPC       ┌───────────────┐
│  浏览器 /     │ ◄─────────────────────► │  Bridge (Node)   │ ◄────────────────────────► │  Codex CLI    │
│  移动端 App   │       HTTP + SSE        │  localhost:8787  │                            │  app-server   │
└──────────────┘                         └──────────────────┘                            └───────────────┘
```

- **Bridge** — runs on your computer, connects to Codex via `codex app-server`, exposes HTTP APIs
- **Client** — browser-first React app (shared with future Tauri mobile shell)
- **Protocol** — typed contracts between bridge and client
- **SDK** — shared transport, thread state management, and live event merge runtime

## Features

- Thread list, thread detail, and live streaming updates
- Send messages, start threads, and interrupt in-progress turns
- Aggregated pending-request inbox (command approvals, file-change approvals, permission requests, tool user-input)
- Local pairing auth with revocable device trust
- Explicit reconnect and resync recovery
- LAN access — open the client from your phone on the same network

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- [Codex CLI](https://github.com/openai/codex) installed and configured

### 1. Install dependencies

```sh
pnpm install
```

### 2. Configure environment

```sh
cp .env.example .env
# Edit .env and set CODEX_SOURCE_CODE_HOME to your local Codex source checkout path
```

### 3. Start the bridge

```sh
pnpm dev:bridge
```

The bridge prints a **pairing code** in the terminal. You'll need this once to trust a new device.

### 4. Start the client

```sh
pnpm dev:client
```

Open [http://localhost:5173](http://localhost:5173) in your browser, enter the pairing code, and you're connected.

### Access from your phone

Both devices must be on the same Wi-Fi. With the client dev server running, find the `Network` address printed in the terminal (e.g. `http://192.168.1.2:5173`) and open it on your phone.

## Project Structure

```
my-codex-app/
├── apps/
│   ├── bridge/          # Local bridge server (Node, connects to Codex app-server)
│   └── client/          # Browser client (React + Vite + Tailwind + shadcn)
├── packages/
│   ├── protocol/        # Shared type contracts (API request/response shapes)
│   └── sdk/             # Bridge transport, thread runtime, live event merge
├── docs/
│   ├── specs/           # Architecture specs
│   ├── plans/           # Milestone plans
│   └── reference/       # Upstream integration guides
└── pnpm-workspace.yaml
```

## Tech Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Client   | React 19, Vite 8, TypeScript, Tailwind CSS, shadcn  |
| Bridge   | Node.js, native `http`, stdio JSON-RPC              |
| Protocol | Shared TypeScript types (no runtime dependencies)   |
| SDK      | TypeScript, `fetch` + `EventSource` (browser-first) |
| Monorepo | pnpm workspaces                                     |

## Auth Model

The bridge uses **local pairing** with revocable device trust — no static shared tokens.

1. Bridge generates a short-lived **pairing code** (printed in terminal, valid 10 min)
2. Client completes pairing with a device identifier and human-readable label
3. Bridge stores a **trusted device record** and issues tokens:
   - **Access token** — 10 min TTL, used for API calls
   - **Refresh token** — 30 day TTL, auto-rotates to keep the session alive
4. Devices can be revoked from the Connection page at any time

Authenticating requests:

- `Authorization: Bearer <access-token>` for normal HTTP APIs
- `access_token=...` query parameter for `EventSource` (SSE) subscriptions

## Scripts

| Command           | Description             |
| ----------------- | ----------------------- |
| `pnpm dev:bridge` | Start bridge dev server |
| `pnpm dev:client` | Start client dev server |
| `pnpm build`      | Build all packages      |
| `pnpm typecheck`  | Type-check all packages |

## Roadmap

See [TODO.md](./TODO.md) for milestone tracking. Upcoming:

- Tauri 2 mobile shell integration
- Remote relay for cross-network access
- Tauri-native secure credential storage
