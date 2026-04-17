# My Codex App

![Status: alpha](https://img.shields.io/badge/status-alpha-orange)
![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![pnpm >=10](https://img.shields.io/badge/pnpm-%3E%3D10-F69220?logo=pnpm&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

**[English](./README.md) | [中文](./README.zh.md)**

Use [Codex](https://github.com/openai/codex) from a browser or phone without
moving execution off your computer. `my-codex-app` combines a local bridge
daemon (`codexb`), a shared React client, and a Tauri mobile shell so you can
watch live threads, answer approvals, and recover quickly after disconnects.

**Links:** [Hosted Web Client](https://lovezhangchuangxin.github.io/my-codex-app/)
· [Bridge CLI Docs](./apps/bridge/README.md) ·
[Architecture Spec](./docs/specs/2026-04-10-codex-mobile-web-platform.md)

## Hosted Client

Try the hosted web client at:

- <https://lovezhangchuangxin.github.io/my-codex-app/>

Notes:

- It is the production build of the shared web client, hosted on GitHub Pages.
- For a real session, you still need your own running bridge.
- If your bridge is only exposed as plain `http://<lan-ip>:8787`, some browsers
  may block requests from the hosted `https` client. In that case, run the
  client locally with `pnpm dev:client` or put the bridge behind HTTPS.

## Why This Project

- **Codex stays local.** The bridge talks to `codex app-server`; your code,
  tools, and execution remain on your machine.
- **One product across browser and phone.** The browser client is the main UI,
  and the Tauri mobile shell reuses that same app.
- **Pairing instead of shared secrets.** Devices are explicitly paired and can
  be revoked later.
- **Built on the official integration surface.** This repository targets
  `codex app-server`, not private desktop-only IPC.

## Project Status

- **Alpha.** The bridge, shared client, and mobile shell are under active
  development.
- **Local network mode works today.** The planned remote relay for cross-network
  access is not implemented yet.
- **The bridge is API-only.** It never serves the frontend; host the client
  separately or run it locally in development.
- **The mobile shell exists in-repo.** Public app-store distribution is not
  announced.

## What You Can Do

- Browse recent threads and open full thread detail
- Stream live turn updates and assistant output
- Send messages, create threads, and interrupt running turns
- Review pending approvals, permissions, and tool user-input in one place
- Pair browsers or devices locally and revoke trusted devices later
- Recover from disconnects by reconnecting and resyncing against bridge state

## Screenshots

<table>
  <tr>
    <td width="50%">
      <strong>Projects</strong><br />
      <img
        src="./docs/assets/screenshots/projects.png"
        alt="Projects page showing imported projects"
      />
    </td>
    <td width="50%">
      <strong>Project Threads</strong><br />
      <img
        src="./docs/assets/screenshots/project-threads.png"
        alt="Project sessions page showing threads within a project"
      />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Thread Detail</strong><br />
      <img
        src="./docs/assets/screenshots/thread-detail.png"
        alt="Thread detail page showing live turn output"
      />
    </td>
    <td width="50%">
      <strong>Project Browser</strong><br />
      <img
        src="./docs/assets/screenshots/project-browser.png"
        alt="Project browser page showing workspace files"
      />
    </td>
  </tr>
</table>

## Architecture

```text
┌──────────────┐    LAN / Relay (planned)    ┌──────────────────┐    stdio JSON-RPC    ┌───────────────┐
│  Browser /   │ ◄────────────────────────► │  Bridge (codexb) │ ◄──────────────────► │  Codex CLI    │
│  Mobile App  │        HTTP + SSE          │                  │                      │  app-server   │
└──────────────┘                             └──────────────────┘                      └───────────────┘
```

- **Bridge (`codexb`)**: desktop daemon that connects to Codex and exposes HTTP
  and SSE APIs
- **Client**: browser-first React app shared by the browser and Tauri mobile
  host
- **Protocol**: typed bridge-client contracts in `packages/protocol`
- **SDK**: shared transport, thread runtime, and live event merge logic in
  `packages/sdk`

## Quick Start

### Option A: Use the published bridge

1. Install [Codex CLI](https://github.com/openai/codex) and make sure `codex`
   is on your `PATH`.
2. Install the bridge:

   ```sh
   npm i -g @my-codex-app/bridge
   ```

3. Start the daemon:

   ```sh
   codexb start
   ```

4. Check health and pairing status:

   ```sh
   codexb doctor
   codexb pair show
   ```

5. Connect a client:
   - **Web**: open the hosted client at
     `https://lovezhangchuangxin.github.io/my-codex-app/`, run it locally from
     this repository, or host the static build from `apps/client`
   - **Mobile**: run or build the Tauri shell from `apps/mobile`, then scan the
     QR code shown by `codexb pair show`

Quick verification: open `http://<bridge-url>/healthz`. You should get
`{"status":"ok"}`.

For the full CLI reference, see [apps/bridge/README.md](./apps/bridge/README.md).

### Option B: Run the full repo locally

#### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10
- [Codex CLI](https://github.com/openai/codex) installed and configured

#### Setup

```sh
pnpm install
cp .env.example .env
# Edit .env and set CODEX_SOURCE_CODE_HOME to your local Codex checkout path
pnpm build
```

`CODEX_SOURCE_CODE_HOME` is used as the upstream reference checkout for
`codex app-server` behavior and integration details.

#### Run in dev mode

```sh
pnpm dev:bridge
pnpm dev:client
```

Open `http://localhost:5173`, point the client at your bridge if needed, and
complete pairing on `/pair`.

The web client is a static Vite app. This repo includes a GitHub Pages deploy
workflow in `.github/workflows/deploy-client.yml` and is currently published at
`https://lovezhangchuangxin.github.io/my-codex-app/`, but any static host
works.

## Mobile Notes

The bridge target must point at the computer running the bridge, not the phone
itself.

- Android emulator: use `http://10.0.2.2:8787`
- Real device on LAN: use your computer's LAN IP such as
  `http://192.168.1.23:8787`
- USB debugging with port reverse: run `adb reverse tcp:8787 tcp:8787`, then
  use `http://127.0.0.1:8787`

If `http://<bridge-target>/healthz` does not return `{"status":"ok"}`, pairing
and thread APIs will not work either.

## Monorepo Layout

| Path                | Package / App            | Responsibility                               |
| ------------------- | ------------------------ | -------------------------------------------- |
| `apps/bridge`       | `@my-codex-app/bridge`   | Desktop bridge daemon and `codexb` CLI       |
| `apps/client`       | `@my-codex-app/client`   | Shared React client for browser and mobile   |
| `apps/mobile`       | `@my-codex-app/mobile`   | Tauri 2 mobile shell reusing `apps/client`   |
| `packages/protocol` | `@my-codex-app/protocol` | Shared bridge-client protocol types          |
| `packages/sdk`      | `@my-codex-app/sdk`      | Transport, thread runtime, event merge logic |
| `docs/`             | spec / plan / references | Product, architecture, and integration docs  |

## Common Commands

| Command                                   | Description                     |
| ----------------------------------------- | ------------------------------- |
| `pnpm dev:bridge`                         | Start bridge dev server         |
| `pnpm dev:client`                         | Start client dev server         |
| `pnpm mobile:android:dev`                 | Run the Tauri app on Android    |
| `pnpm mobile:android:build`               | Build Android release artifacts |
| `pnpm mobile:ios:dev`                     | Run the Tauri app on iOS        |
| `pnpm build`                              | Build all packages              |
| `pnpm typecheck`                          | Type-check the monorepo         |
| `pnpm --filter @my-codex-app/bridge test` | Run bridge tests                |
| `pnpm fmt`                                | Format the repository           |

## Docs

Start here if you want to understand the product and architecture rather than
just run it:

- [docs/specs/2026-04-10-codex-mobile-web-platform.md](./docs/specs/2026-04-10-codex-mobile-web-platform.md)
- [docs/plans/2026-04-10-codex-mobile-web-platform.md](./docs/plans/2026-04-10-codex-mobile-web-platform.md)
- [docs/reference/2026-04-11-codex-upstream-integration-guide.md](./docs/reference/2026-04-11-codex-upstream-integration-guide.md)
- [apps/bridge/README.md](./apps/bridge/README.md)

## Publishing

Three packages are intended to be published under the `@my-codex-app` npm
scope:

- `@my-codex-app/protocol`
- `@my-codex-app/sdk`
- `@my-codex-app/bridge`

Versions are managed with
[changesets](https://github.com/changesets/changesets) in fixed mode, so the
published packages share the same version.

Release flow:

```sh
pnpm changeset
pnpm version
pnpm release
```

The `pnpm release` script runs `pnpm build && changeset publish`.

Android app releases are published separately from the npm packages. The
workflow at `.github/workflows/release-android.yml` builds signed Android
release assets from `apps/mobile`, uploads a universal APK and AAB to a GitHub
Release, and expects repository Actions secrets for the Android signing
keystore.

Recommended flow:

```sh
# Update apps/mobile/src-tauri/tauri.conf.json version first
git tag mobile-v0.1.0
git push origin mobile-v0.1.0
```

Tag pushes create a published GitHub Release by default.

You can also run the workflow manually with `workflow_dispatch` to rebuild an
existing pushed `mobile-v<version>` tag. The manual path checks out that tag
before building and lets you choose whether the resulting release stays draft or
is published.

See:

- `docs/specs/2026-04-17-android-github-release-automation.md`
- `docs/plans/2026-04-17-android-github-release-automation.md`

## Contributing

- Read the relevant docs in `docs/specs/` and `docs/plans/` before changing
  architecture or protocol behavior
- Keep shared API contracts in `packages/protocol`
- Keep browser and Tauri-mobile behavior aligned unless a platform difference is
  required
- Run `pnpm typecheck`, `pnpm --filter @my-codex-app/bridge test`, and
  `pnpm fmt` before opening a pull request
- If you change architecture, protocol shape, or milestone scope, update the
  docs alongside the code

## Roadmap

- Tauri mobile release hardening
- Remote relay for cross-network access
- Tauri-native secure credential storage

## License

[MIT](./LICENSE)
