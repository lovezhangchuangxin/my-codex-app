# Thread Detail Session Commands

## Relationship To Existing Docs

This spec extends and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-13-project-centered-threads-home.md`
- `docs/specs/2026-04-13-thread-detail-command-and-file-input.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`

It adds session-management slash commands to the existing thread detail
composer. It does not redesign the current thread detail page, project home
navigation model, or upstream Codex thread lifecycle.

## Background

The current Web composer only supports a narrow command subset:

- `/compact`
- `/review`
- `/mention`
- `/model`
- `/permissions`

That leaves an important gap compared with upstream Codex-native surfaces:

- users cannot rename the current session from the composer
- users cannot quickly start a new session in the current project without
  leaving thread detail
- users cannot open the existing session switcher from the composer

This gap is especially visible now that the product is project-centered. Thread
detail should let users move between sessions in the same project without
breaking that project-first mental model.

## Goals

- Add `/rename` support for renaming the current session from thread detail.
- Add `/new` support for starting a new session in the current project from
  thread detail.
- Add `/clear` as a Web alias for `/new`.
- Add `/resume` support that opens the existing session-switcher flow from
  thread detail.
- Keep command semantics aligned with upstream Codex where practical.
- Preserve the project-centered navigation model:
  - new sessions stay in the current project
  - resume picks from the current project's sessions
- Keep the implementation typed across `protocol`, `bridge`, `sdk`, and
  `client`.

## Non-Goals

- Full upstream TUI parity for `/resume <id-or-name>`.
- A global cross-project resume picker.
- Terminal-style screen clearing behavior for `/clear`.
- Replacing the existing thread header switcher with a different navigation
  pattern.
- Adding unrelated upstream slash commands from the broader TUI catalog.

## Supported Command Semantics

### `/rename`

- Treated as a command action, not normal text.
- Bare `/rename` opens a lightweight rename input surface for the current
  thread.
- `/rename <name>` renames the current thread immediately.
- The Web client should call upstream `thread/name/set` through the bridge.

### `/new`

- Treated as a command action, not normal text.
- Starts a new thread whose `cwd` is the current thread's project path.
- On success, navigates into the new thread detail just like the existing
  "New session" project action.

### `/clear`

- Alias of `/new` in the Web client.
- Rationale:
  - upstream TUI clears terminal UI and then starts a fresh session
  - the browser client does not have a terminal transcript or scrollback to
    clear
  - the closest coherent Web behavior is "start a new session in this project"

### `/resume`

- Treated as a command action, not normal text.
- Bare `/resume` opens the same thread-switcher sheet already used in thread
  detail.
- The picker remains scoped to the current project's session list rather than a
  global all-thread list.
- This slice does not support `/resume <id-or-name>`.

### Unsupported Slash Input

- Unsupported slash input still falls back to normal plain-text send behavior.
- Unsupported argument forms such as `/resume abc` remain plain text in this
  slice.

## Upstream Alignment

The Web client should follow upstream Codex semantics where they map cleanly:

- upstream supports `thread/name/set`, so rename should use a typed bridge call
  rather than a client-only title override
- upstream TUI treats bare `/new`, bare `/clear`, and bare `/resume` as local
  UI actions rather than normal message submission
- upstream also supports inline `/rename <name>`; the Web client should match
  that behavior

The Web client intentionally diverges in one place:

- `/clear` should not attempt terminal clearing; it should be a project-scoped
  new-session alias

## User Experience Requirements

### Rename Flow

- Bare `/rename` should open a small input surface without losing the current
  composer draft unnecessarily.
- If rename fails, the user should see the bridge error and keep any relevant
  draft state.
- Successful rename should update:
  - thread detail title
  - visible session cards / switcher rows for that thread

### New Session Flow

- `/new` and `/clear` should behave like the existing "New session" action in
  the project sessions panel.
- New session creation should reuse the current thread's `cwd`.
- On success, the user should land in the new thread detail.

### Resume Flow

- `/resume` should open the existing thread switcher rather than duplicating a
  second session-picker UI.
- The sheet should work on desktop and mobile from thread detail.
- Choosing a session should follow the same route / panel navigation behavior
  as other thread-open actions.

## Architecture Direction

### Client

- Continues to own slash command detection, popup filtering, and dispatch rules.
- Reuses the existing project-scoped new-thread and open-thread controller
  actions.
- Extracts the thread switcher into a reusable controlled component so both the
  header button and `/resume` can open the same sheet.
- Owns the rename input sheet and inline command submission behavior.

### Bridge

- Adds a typed client-facing rename API that maps to upstream
  `thread/name/set`.
- Forwards upstream `thread/name/updated` notifications as typed bridge events.

### SDK

- Exposes `renameThread(...)` as a runtime action.
- Updates selected thread detail and thread summary state when a
  `threadNameUpdated` event arrives.

## Protocol Requirements

The shared protocol must add:

- `ThreadRenameRequest`
- `ThreadRenameResponse`
- `BridgeEvent` variant for `threadNameUpdated`

The rename contract should be thread-centric:

- identify the target by `threadId`
- provide a normalized user-facing `name`

The protocol should not add:

- global resume-picker request/response types
- special `/clear`-specific payloads

## Error Handling And Fallbacks

- `/rename` failures must keep the command draft intact when applicable.
- `/new` and `/clear` failures must leave the current thread unchanged and show
  an error toast.
- `/resume` should degrade gracefully if the current project session list is not
  ready yet; the picker can still show loading or unavailable state.
- Invalid rename input such as an empty name should be rejected before or by the
  bridge with a clear message.

## Acceptance Criteria

- Slash popup shows `/rename`, `/new`, `/clear`, and `/resume`.
- Bare `/rename` opens a rename sheet for the current thread.
- `/rename <name>` renames the current thread without sending literal slash text
  as a user turn.
- `/new` starts a new thread in the current project and navigates into it.
- `/clear` behaves as an alias of `/new`.
- `/resume` opens the existing "Switch thread" sheet and the user can select a
  session from it.
- Successful rename updates thread detail and visible session-list naming for
  the current thread.
- Type consistency is preserved across `protocol`, `bridge`, `sdk`, and
  `client`.
