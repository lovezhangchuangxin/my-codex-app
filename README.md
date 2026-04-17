# My Codex App

**[English](./README.md) | [中文](./README.zh.md)**

Access [Codex](https://github.com/openai/codex) from your browser and phone. Codex stays on your computer — this project adds a local bridge daemon, a shared Web client, and a Tauri mobile host so you can monitor sessions, respond to approvals, and read live progress from any device on your network.

## Architecture

```
┌──────────────┐    LAN / Relay     ┌──────────────────┐    stdio JSON-RPC    ┌───────────────┐
│  Browser /   │ ◄───────────────► │  Bridge (codexb) │ ◄──────────────────► │  Codex CLI    │
│  Mobile App  │     HTTP + SSE    │                  │                      │  app-server   │
└──────────────┘                    └──────────────────┘                      └───────────────┘
```

- **Bridge** (`codexb`) — desktop daemon. Connects to Codex via `codex app-server`, exposes HTTP + SSE APIs.
- **Client** — browser-first React app, shared by the browser and Tauri mobile host.
- **Protocol** — typed contracts between bridge and client (`packages/protocol`).
- **SDK** — shared transport, thread state management, and live event merge runtime (`packages/sdk`).

## Features

- Thread list, thread detail, and live streaming updates
- Send messages, start threads, and interrupt in-progress turns
- Aggregated pending-request inbox (approvals, permissions, tool user-input)
- Local pairing auth with revocable device trust
- Automatic reconnect and resync recovery
- LAN access — open the client from your phone on the same network

## Getting Started

### 1. Install the bridge

```sh
npm i -g @my-codex-app/bridge
```

### 2. Start the bridge

```sh
codexb start
```

This starts the bridge daemon in the background. Make sure [Codex CLI](https://github.com/openai/codex) is installed and on your PATH.

### 3. Connect from your phone

Install the mobile app, scan the QR code displayed by `codexb pair show`, and you're connected. Both devices must be on the same Wi-Fi.

For the full bridge command reference, see [apps/bridge/README.md](apps/bridge/README.md).

## Development Guide

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10
- [Codex CLI](https://github.com/openai/codex) installed and configured

### Setup

```sh
pnpm install
cp .env.example .env
# Edit .env and set CODEX_SOURCE_CODE_HOME to your local Codex source checkout path
pnpm build
```

### Run in dev mode

```sh
pnpm dev:bridge   # Start bridge
pnpm dev:client   # Start client
```

### Tauri Android Notes

The bridge target must point at the computer running the bridge, not the phone itself.

- Android Emulator: use `http://10.0.2.2:8787`
- Real device on LAN: use your computer's LAN IP such as `http://192.168.1.23:8787`
- USB debugging with port reverse: run `adb reverse tcp:8787 tcp:8787`, then use `http://127.0.0.1:8787`

Quick check: open `http://<bridge-target>/healthz` from the device browser — if it doesn't return `{"status":"ok"}`, pairing and thread APIs won't work either.

## Project Structure

```
my-codex-app/
├── apps/
│   ├── bridge/          # Bridge daemon (codexb CLI)
│   ├── client/          # Shared client app (React + Vite + Tailwind + shadcn)
│   └── mobile/          # Tauri 2 mobile host shell (reuses apps/client)
├── packages/
│   ├── protocol/        # Shared type contracts
│   └── sdk/             # Bridge transport, thread runtime, live event merge
├── docs/
│   ├── specs/           # Architecture specs
│   ├── plans/           # Milestone plans
│   └── reference/       # Upstream integration guides
└── pnpm-workspace.yaml
```

## Common Commands

| Command                     | Description                   |
| --------------------------- | ----------------------------- |
| `pnpm dev:bridge`           | Start bridge dev server       |
| `pnpm dev:client`           | Start client dev server       |
| `pnpm mobile:android:dev`   | Run Tauri app on Android      |
| `pnpm mobile:android:build` | Build Android release APK     |
| `pnpm mobile:ios:dev`       | Run Tauri app on iOS          |
| `pnpm build`                | Build all packages            |
| `pnpm typecheck`            | Type-check all TypeScript     |
| `pnpm fmt`                  | Format code                   |

## Roadmap

See [TODO.md](./TODO.md) for milestone tracking. Upcoming:

- Tauri mobile release hardening
- Remote relay for cross-network access
- Tauri-native secure credential storage
