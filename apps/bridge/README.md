# @my-codex-app/bridge

The `codexb` CLI — a desktop daemon that connects to [Codex](https://github.com/openai/codex) and exposes it to browser and mobile clients over HTTP + SSE.

## Install

```sh
npm i -g @my-codex-app/bridge
```

Or with pnpm:

```sh
pnpm add -g @my-codex-app/bridge
```

## Quick Start

```sh
# Start the bridge daemon in the background
codexb start

# Show pairing QR code and status
codexb pair show

# Check that everything is healthy
codexb doctor
```

Scan the QR code from the mobile app or open the bridge URL in your browser to connect.

## Commands

### Daemon

| Command          | Description                               |
| ---------------- | ----------------------------------------- |
| `codexb start`   | Start the bridge daemon in the background |
| `codexb run`     | Run the bridge daemon in the foreground   |
| `codexb stop`    | Stop the running bridge daemon            |
| `codexb restart` | Restart the bridge daemon                 |
| `codexb status`  | Show daemon status and connection info    |
| `codexb logs`    | Show daemon logs (`--follow` to tail)     |

### Pairing

| Command               | Description                     |
| --------------------- | ------------------------------- |
| `codexb pair show`    | Show pairing QR code and status |
| `codexb pair refresh` | Generate a new pairing code     |

### Devices

| Command                      | Description                |
| ---------------------------- | -------------------------- |
| `codexb devices list`        | List all trusted devices   |
| `codexb devices revoke <id>` | Revoke access for a device |
| `codexb devices delete <id>` | Remove a device record     |

### Configuration

| Command                           | Description                   |
| --------------------------------- | ----------------------------- |
| `codexb config show`              | Display current configuration |
| `codexb config get <key>`         | Get a single config value     |
| `codexb config set <key> <value>` | Set a config value            |
| `codexb config edit`              | Open config file in `$EDITOR` |
| `codexb config reset`             | Reset config to defaults      |

### Projects

| Command                         | Description                |
| ------------------------------- | -------------------------- |
| `codexb projects list`          | List imported projects     |
| `codexb projects import <path>` | Import a project directory |
| `codexb projects remove <path>` | Remove an imported project |

### Utilities

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `codexb doctor`     | Run diagnostics and check prerequisites |
| `codexb version`    | Print version information               |
| `codexb completion` | Output shell completion script          |

All commands support `--json` for machine-readable output.

## Configuration

The bridge stores config and state under `~/.codexb/` by default.

```
~/.codexb/
├── config.json       # User configuration
├── runtime.json      # Live daemon metadata
├── state.json        # Auth and device trust state
└── logs/
    └── bridge.log    # Daemon log output
```

### Common overrides

```sh
# Change listen port
codexb config set port 9000

# Set advertised URL (useful behind reverse proxies)
codexb config set bridgeUrl https://codexb.example.com

# Allow specific CORS origins
codexb config set corsOrigins https://app.example.com,http://localhost:5173
```

### Config keys

| Key           | Default                     | Description           |
| ------------- | --------------------------- | --------------------- |
| `host`        | `0.0.0.0`                   | Listen host           |
| `port`        | `8787`                      | Listen port           |
| `bridgeUrl`   | auto from host:port         | Advertised bridge URL |
| `corsOrigins` | `*`                         | Allowed CORS origins  |
| `logPath`     | `~/.codexb/logs/bridge.log` | Log file path         |

## Shell Completion

```sh
# Bash
codexb completion --shell bash >> ~/.bashrc

# Zsh
codexb completion --shell zsh >> ~/.zshrc

# Fish
codexb completion --shell fish > ~/.config/fish/completions/codexb.fish
```

## Logs

```sh
# Show recent logs
codexb logs

# Tail logs in real time
codexb logs --follow

# Show more lines
codexb logs --tail 500
```
