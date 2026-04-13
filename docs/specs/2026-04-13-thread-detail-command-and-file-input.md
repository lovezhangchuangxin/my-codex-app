# Thread Detail Command And File Input

## Relationship To Existing Docs

This spec extends and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-12-thread-chat-flow.md`
- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-13-thread-detail-composer-controls.md`

It adds command-entry and file-reference affordances to the existing thread
detail composer. It does not replace the current thread, turn, approval, or
workspace-browser model.

## Background

The current thread detail composer can only submit plain text. That leaves a
gap with Codex-native surfaces:

- users cannot type `/` and choose a supported command from a popup
- users cannot type `@` and search workspace files inline while composing a
  message
- users cannot trigger a small but important subset of Codex command flows from
  the Web client even though upstream Codex already supports them

Upstream Codex does not treat these inputs as one generic text feature:

- file references inserted from `@` search are plain text path insertions
- some slash commands are UI-level helpers
- other slash commands dispatch to dedicated app-server methods instead of
  sending literal `/command` text as a normal user turn

This feature must preserve that distinction.

## Goals

- Add a slash-command popup to the thread detail composer.
- Add workspace file search triggered by `@` inside the composer.
- Support prefix or fuzzy filtering while the user types, such as `/re` for
  `/review`.
- Keep the Web client aligned with upstream Codex semantics for supported
  commands instead of sending command text blindly as a normal turn.
- Keep the implementation typed across `protocol`, `bridge`, `sdk`, and
  `client`.
- Preserve plain-text message sending as the default path when no command or
  file selection is active.

## Non-Goals

- Full TUI slash-command parity.
- Skill, app, or plugin mention support in this slice.
- A general rich-text composer or reusable text-element editor.
- Image attachment support.
- Base-branch and commit review pickers in this slice.
- Exposing raw app-server command or file-search internals directly to the
  browser client.

## Scope

### In Scope

- slash popup activation from `/` on the first line of the composer
- command filtering based on the characters after `/`
- keyboard and pointer selection for popup items
- `@` file search popup for workspace-relative file insertion
- bridge-side workspace file search rooted at the current thread `cwd`
- typed bridge APIs for:
  - thread compaction
  - review start
  - workspace file search
- client command handling for this supported subset:
  - `/compact`
  - `/review`
  - `/mention`
  - `/model`
  - `/permissions`

### Out Of Scope For This Slice

- unsupported slash commands from the upstream TUI catalog
- automatic command discovery from app-server
- hidden mention binding state for skills, apps, or plugins
- bridge-side branch enumeration or commit enumeration
- automatic path insertion outside the current thread workspace root

## Supported Command Semantics

The Web client should support the following slash commands in this slice.

### `/compact`

- Treated as a command action, not normal text.
- Dispatches to bridge, then app-server `thread/compact/start`.
- Returns immediately and relies on normal thread events for progress.

### `/review`

- Treated as a command action, not normal text.
- Bare `/review` opens a small review target picker for this slice with:
  - uncommitted changes
  - custom instructions
- `/review <text>` dispatches `review/start` with a custom-instructions target.

### `/mention`

- UI helper only.
- Does not create a turn or bridge request.
- Inserts `@` into the composer so the file-search popup can take over.

### `/model`

- UI helper only.
- Reuses the existing composer settings surface.
- Opens the settings surface in model-editing context rather than sending a
  command.

### `/permissions`

- UI helper only.
- Reuses the existing composer settings surface.
- Opens the settings surface in permission-editing context rather than sending
  a command.

### Unsupported Slash Input

- If the typed slash token does not match a supported command in this slice, it
  remains plain text.
- If the user submits that text, it should be sent as a normal user message.

## User Experience Requirements

### Slash Popup

- The slash popup only activates when the first token on the first line starts
  with `/`.
- The popup should filter as the user types after `/`.
- Matching should be forgiving enough that `/re` matches `/review`.
- `Tab` and `Enter` should accept the highlighted popup item.
- `Esc` should dismiss the popup without mutating unrelated text.
- When a supported command is selected, the client should dispatch the command
  action instead of sending literal slash text.

### File Search Popup

- The file popup activates when the caret is inside an `@token`.
- File search can appear in any message position, including later words and
  slash-command arguments such as `/review @src/...`.
- The popup should search workspace-relative paths.
- Selecting a file inserts the relative path into the text buffer.
- If the inserted path contains whitespace, the client should quote it so the
  visible text remains a single usable path token.
- The file popup and slash popup should not compete for focus at the same time.

### Composer Preservation

- Failed command execution must preserve the user's current draft text.
- Failed file search must not block normal message sending.
- `/model` and `/permissions` should preserve the current text draft while
  opening the existing settings UI.

## Review Scope For This Slice

Bare `/review` does not attempt full TUI parity.

For this slice the available review targets are:

- uncommitted changes
- custom instructions entered by the user

Reason:

- upstream app-server supports base-branch and commit review targets
- this repository does not yet expose a typed bridge/client flow for branch or
  commit enumeration in thread detail
- this feature should stay focused on command/file input rather than expanding
  into a broader git-review browser

## Architecture Direction

The implementation should split responsibilities clearly:

### Client

- owns popup activation, filtering state, keyboard interaction, and text
  insertion
- decides when a supported slash command should dispatch an action rather than
  submit plain text
- keeps slash-command definitions for the supported Web subset

### Bridge

- exposes typed client-facing APIs for slash commands that map to upstream
  app-server methods
- exposes bridge-owned workspace file search rooted at the thread workspace
- enforces workspace containment for file search results

### Upstream App-Server Alignment

- `/compact` must map to `thread/compact/start`
- `/review` must map to `review/start`
- `@` file search is not an app-server method today, so it is a bridge-owned
  companion capability rather than a raw upstream passthrough

## Protocol Requirements

The shared protocol must add dedicated request and response types for:

- thread compaction
- review start
- workspace file search

The workspace file-search contract must be thread-centric:

- request identifies the thread by `threadId`
- query is interpreted relative to that thread's `cwd`
- results return workspace-relative paths only

The protocol should not expose:

- absolute host paths in the normal client-facing result list
- raw app-server request envelopes

## Search Behavior Requirements

The bridge-side file search should:

- search within the resolved thread workspace root only
- return relative paths only
- cap result count to keep the popup responsive
- tolerate unreadable files or directories by skipping them rather than failing
  the whole search
- reject any query path interpretation that escapes the workspace root

The initial matching behavior may be simpler than upstream TUI internals, but
it must support practical path discovery from partial input.

## Error Handling And Fallbacks

- If thread workspace resolution fails, file search should show an unavailable
  state and the composer should still allow plain-text sending.
- If `/compact` or `/review` request dispatch fails, the client should surface
  the bridge error and keep the draft intact.
- If the review target picker cannot complete because the user dismisses it, the
  composer should remain unchanged.
- If file search returns no matches, the popup should show an explicit empty
  state rather than closing abruptly.

## Compatibility Constraints

- The feature must work in the shared browser-first client architecture.
- The feature must not require Tauri-only APIs.
- The feature must not change the meaning of existing thread send, interrupt,
  approval, or user-input flows.
- The feature must remain compatible with the current workspace browser and
  reuse its thread-root assumptions where appropriate.

## Risks

### Semantics Risk

- Treating all slash inputs as plain text would diverge from upstream Codex and
  produce incorrect behavior.

### Performance Risk

- Naive recursive file search can become slow in large workspaces.

### Scope Risk

- Attempting full TUI slash parity would pull this feature into unrelated areas
  such as git pickers, thread lifecycle commands, and desktop-only actions.

## Acceptance Criteria

- Typing `/` in the thread detail composer opens a command popup for the
  supported Web command subset.
- Typing `/re` narrows the popup to `/review`.
- Selecting `/compact` dispatches a compaction request instead of sending slash
  text as a normal turn.
- Selecting bare `/review` opens a review target picker for the supported slice.
- Typing `/review fix the patch flow` dispatches a custom review request.
- Selecting `/mention` inserts `@` into the composer.
- Typing `@` opens a file popup backed by bridge workspace search.
- Selecting a file inserts a workspace-relative path into the composer text.
- Unsupported slash input still falls back to normal plain-text sending.
- The feature works without breaking existing send, interrupt, settings, or
  workspace-browser behavior.
