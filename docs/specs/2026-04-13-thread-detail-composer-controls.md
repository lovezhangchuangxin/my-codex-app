# Thread Detail Composer Controls

> **Status: Implemented** — All acceptance criteria met. Primary implementation
> lives in `apps/client/src/features/threads/components/thread-detail-composer.tsx`.

## Background

The current thread detail composer in `apps/client` is intentionally minimal. It
supports entering plain text and submitting it, but it does not expose the
thread-scoped runtime controls that Codex already supports through app-server.

This creates two problems:

- The bottom input area feels incomplete compared with Codex-native surfaces.
- Users cannot inspect or adjust the current thread's model, reasoning effort,
  or permission mode from the thread detail page.

This iteration upgrades the thread detail composer from a single-row send bar
into a richer control surface while keeping the interaction model explicit and
typed across `client`, `sdk`, `protocol`, and `bridge`.

## Goals

- Make the thread detail composer visually richer and easier to use on both
  desktop and mobile.
- Surface the current thread's effective model and related runtime controls in
  the composer area.
- Let the user change model, reasoning effort, and permission mode for the
  current thread before sending the next message.
- Show context-window usage in the composer area with an explicit detailed
  view.
- Keep the implementation aligned with upstream `codex app-server` semantics.

## Non-Goals

- Image upload in this iteration.
- Rich-text editing or slash-command redesign.
- Adding a new bridge-side persistence layer for thread settings outside the
  existing app-server lifecycle.
- Reading upstream internal SQLite metadata directly as the primary source of
  truth for this feature.
- Full custom editing of every raw app-server setting. This iteration only
  exposes a curated subset in the UI.

## User Requirements

### Composer layout

- The text input area should be taller than the current single-row composer.
- The bottom row of the composer should contain functional controls.
- The send / stop action should move from the right edge of the textarea to the
  bottom-right corner of the composer.

### Session settings

- The composer should show the current model name.
- The user should be able to open a settings control and change:
  - model
  - reasoning effort
  - permission mode
- These settings should apply to the current thread using upstream-supported
  turn overrides and become the default for subsequent turns in that thread.

### Context window

- The composer should show a circular context-usage indicator.
- The user should be able to open a detailed view showing:
  - used percentage
  - used tokens
  - total context window size
  - latest turn token usage details

## Solution Overview

## Composer UI structure

The thread detail composer becomes a two-level control surface:

1. A larger textarea area for message entry.
2. A footer row containing:
   - a model / session settings trigger
   - a context window usage trigger
   - the primary send or stop action

The footer remains part of the same form and preserves current Enter-to-send
behavior on desktop.

## Thread settings model

The feature introduces a bridge-facing thread settings model separate from the
raw thread transcript:

- current model
- current reasoning effort
- current approval policy and sandbox policy
- derived permission preset identifier for the curated UI

The bridge is responsible for:

- capturing effective thread settings from `thread/start` and `thread/resume`
  responses
- caching the latest known settings per thread
- applying user-selected overrides on `turn/start`
- broadcasting a thread settings update event to subscribed clients after a
  successful turn start with overrides

The client is responsible for:

- rendering the last known settings
- keeping a local draft while the user edits controls
- sending only supported overrides for the next turn

## Permission mode scope

This iteration exposes a curated permission selector based on Codex's built-in
approval presets:

- `read-only`
- `auto`
- `full-access`

Each preset maps to a specific `approvalPolicy + sandboxPolicy` pair on the
bridge. If a thread's effective raw settings do not match one of these presets,
the UI should surface that as a custom / unknown state but still allow the user
to switch to one of the supported presets.

## Context usage model

Context usage is sourced from upstream `thread/tokenUsage/updated` notifications.
The bridge caches the last known usage per thread and exposes it in:

- thread detail reads
- thread context usage update events

This iteration does not add a new bridge-side persistence path for historical
usage. As a result:

- threads observed by the current bridge process can show live or cached usage
- threads without any observed usage in the current bridge process show an
  unavailable / unknown state until a token usage notification arrives

## Upstream alignment

This feature must remain aligned with upstream app-server behavior:

- `turn/start` supports overrides for model, effort, approval policy, and
  sandbox policy
- `thread/start` and `thread/resume` return the effective thread settings
- `model/list` returns visible model choices and supported reasoning efforts
- `thread/tokenUsage/updated` is the authoritative live source for context
  window usage

The bridge must not invent a conflicting thread lifecycle or claim stronger
historical guarantees than upstream provides.

## Module Responsibilities

### `packages/protocol`

- Define typed thread settings, permission presets, model list payloads, and
  thread context usage payloads.
- Extend thread read / turn start contracts and bridge event types.

### `apps/bridge`

- Expand app-server response typing for thread settings, models, and token
  usage.
- Cache last known thread settings and last known context usage.
- Map curated permission presets to app-server `approvalPolicy` and
  `sandboxPolicy`.
- Expose a client-facing models API.

### `packages/sdk`

- Carry thread settings and context usage through runtime state.
- Apply bridge events to thread detail snapshots.
- Allow turn start requests to include settings overrides.

### `apps/client`

- Redesign the thread detail composer layout.
- Render session settings and context usage controls.
- Fetch model options for the settings UI.
- Keep the new controls responsive on desktop and mobile layouts.

## Error Handling And Fallbacks

- If model list loading fails, the composer should keep the existing model label
  but disable changing it until a retry succeeds.
- If thread settings are unavailable, the UI should show a disabled fallback
  state instead of fake defaults.
- If context usage is unavailable, the ring indicator should render an explicit
  unknown state and the detail popup should explain that usage has not been
  observed yet.
- If a turn start with overrides fails, the UI must preserve the user's draft
  input and settings draft.

## Acceptance Criteria

- Thread detail composer is visually split into a larger textarea area and a
  footer controls row.
- Send / stop action is located at the bottom-right of the composer.
- The current model is visible in the composer and can be changed from the UI.
- The user can choose a reasoning effort compatible with the selected model.
- The user can switch between supported permission presets for the current
  thread.
- The context usage trigger renders as a circular meter when usage is known.
- The context usage popup shows percentage, used tokens, total context window,
  and latest turn usage details.
- The feature works on desktop and mobile layouts without breaking existing
  thread send / interrupt behavior.
- Protocol, bridge, sdk, and client types remain consistent.
