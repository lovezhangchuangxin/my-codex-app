# Thread Detail Workspace Browser Spec

## Relationship To Existing Docs

This spec extends and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-12-thread-chat-flow.md`
- `docs/specs/2026-04-12-client-ui-refactor.md`

It introduces a new bridge/client capability for browsing a thread's workspace
from the thread detail screen. It does not change the upstream Codex thread,
turn, or request lifecycle.

## Background

The current thread detail experience is optimized for reading the conversation
stream. That works well for live Codex monitoring, but it leaves an important
gap during real usage:

- users can see that Codex changed files, but cannot inspect the surrounding
  project structure from the same screen
- users can see file paths in file-change items, mentions, and image-view items,
  but cannot open those files in context
- mobile users especially need a lightweight, read-oriented project browser
  instead of falling back to desktop terminal access

The thread already carries a stable workspace anchor through `thread.cwd`. The
client should use that context to expose a read-only project browser directly
from thread detail.

## Goals

- Add a clear entry point in thread detail for browsing the active thread
  workspace.
- Let users inspect the workspace directory structure rooted at `thread.cwd`.
- Let users open and read individual file contents without leaving thread detail.
- Reuse upstream Codex app-server filesystem capabilities through the bridge
  instead of inventing a conflicting file access model.
- Keep the feature Web-first and usable from both browser and future Tauri
  mobile shells.
- Preserve the conversation stream as the primary focus of the page.

## Non-Goals

- Editing, creating, renaming, copying, or deleting files.
- A standalone "Files" route that competes with the thread detail route.
- Full IDE behavior such as tabs, split panes, search-in-files, or code actions.
- Streaming filesystem watch updates in the initial slice.
- Reading arbitrary host paths outside the thread workspace root.
- Exposing raw upstream `fs/*` APIs directly to browser clients.

## Scope

### In Scope

- a thread-detail entry point for opening a workspace browser
- bridge APIs for read-only directory listing and file reading
- protocol and SDK additions required for those APIs
- a client-side workspace browser surface with:
  - lazy directory expansion
  - file preview
  - empty/error/loading states
  - mobile and desktop layouts
- deep-link style actions from thread items into the workspace browser for known
  file paths

### Out Of Scope For This Slice

- write operations
- file upload or download management
- syntax-aware diff navigation beyond existing file-change cards
- filesystem push subscriptions
- cross-thread shared workspace caches

## User Experience Requirements

### Entry Point

- Thread detail must expose a visible, low-friction workspace-browser entry.
- The entry should live in the thread header area near the workspace context,
  not inside the message stream body.
- The conversation stream must remain visible and primary when the browser is
  closed.

### Presentation Model

- The workspace browser should open as an overlay surface rather than a new page.
- Desktop should use a right-side sheet or drawer large enough to show both a
  directory tree and a file preview.
- Mobile should use a full-height sheet with a drill-in flow that remains usable
  on narrow screens.

### Directory Browsing

- The browser root must correspond to `thread.cwd`.
- Directory entries must show folder/file distinction clearly.
- Directories should load children lazily when expanded.
- The client should display relative paths inside the browser UI rather than
  repeating the full absolute path everywhere.

### File Preview

- Text-like files should render readable content in-app.
- Binary or unsupported files should show metadata and a clear "preview not
  available" state.
- Very large files should degrade gracefully rather than freezing the UI.
- File preview should favor read clarity over editor chrome.

### Thread-Aware Navigation

- File-change items in the thread stream should be able to open the referenced
  file in the workspace browser.
- Other thread item types that already carry file paths, such as `localImage`,
  `imageView`, or `mention`, may also open the browser when the path resolves
  under the workspace root.

## Architecture Direction

The bridge should remain the only client-facing integration point.

The recommended design is:

1. The browser client asks the bridge for a workspace directory listing or file
   contents by `threadId` plus a workspace-relative path.
2. The bridge resolves the authoritative workspace root from the thread's
   `cwd`.
3. The bridge validates that the requested target remains within that root after
   normalization and symlink resolution.
4. The bridge serves read-only results back to the client.
5. The bridge may use upstream Codex app-server filesystem methods internally,
   but the browser client must not call upstream `fs/*` methods directly.

## Protocol Requirements

The shared protocol must define dedicated workspace-browsing request/response
types rather than leaking raw app-server payloads into the client.

The request model must be thread-centric:

- requests identify the workspace through `threadId`
- nested targets use a relative path inside the workspace root

The response model must include enough information for the client to render:

- the resolved root
- the relative path that was requested
- entry metadata for directory listings
- file preview metadata for file reads

The initial protocol should support:

- read directory
- read file

The initial protocol should not support:

- write file
- remove
- copy
- watch

## Security Requirements

### Workspace Containment

- The bridge must enforce that workspace-browser reads stay within the thread's
  resolved `cwd`.
- The client must not be trusted to provide an absolute path.
- Path traversal attempts such as `..` must be rejected.
- Symlink resolution must not allow escaping the workspace root.

### Auth

- The new APIs must use the same authenticated bridge session model as the rest
  of the client-facing API.
- No unauthenticated workspace read surface may be added.

### Exposure

- The client should receive only the minimum metadata needed for read-only
  browsing.
- Raw host filesystem authority must remain inside the bridge.

## Error Handling And Fallback Behavior

- Missing paths should render a clear not-found state.
- Permission or containment failures should render a generic access-denied style
  error without exposing unnecessary host details.
- If a file cannot be previewed as text, the UI should stay functional and show
  a non-preview state.
- If the workspace root is empty or unreadable, the browser should still open
  and communicate the state clearly.

## Performance Constraints

- Directory data should load on demand rather than recursively loading the full
  project tree at open time.
- File content should load only when the user selects a file.
- The initial implementation should avoid keeping large file contents in global
  runtime state.

## Compatibility Constraints

- The feature must work inside the current browser-first client architecture.
- The feature must remain compatible with future Tauri mobile hosting.
- The implementation must preserve the current thread reconnect/resync behavior;
  workspace browsing must not become coupled to thread SSE subscriptions.
- The implementation must not change upstream thread, turn, approval, or user
  input semantics.

## Risks

### Security Risk

- A naive path join implementation could accidentally expose files outside the
  workspace root.

### Performance Risk

- Large repositories and very large files can make the browser feel sluggish if
  the implementation eagerly loads too much data.

### UX Risk

- If the entry point is too prominent or the overlay is too heavy, it can weaken
  the message-stream-first thread-detail experience.

## Acceptance Criteria

- Thread detail exposes a workspace-browser entry point tied to the current
  thread.
- Users can browse directories rooted at `thread.cwd`.
- Users can open and preview text files from that workspace.
- The client can open a file referenced by a thread item in the workspace
  browser.
- The bridge rejects attempts to read outside the workspace root.
- The implementation works on both desktop and mobile layouts.
- The feature uses typed bridge/protocol contracts rather than direct upstream
  app-server exposure.
