# Thread Detail Workspace Browser Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`

It also remains aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-12-thread-chat-flow.md`
- `docs/specs/2026-04-12-client-ui-refactor.md`

## Implementation Strategy

This feature spans four layers:

- `packages/protocol`
- `packages/sdk`
- `apps/bridge`
- `apps/client`

The implementation should be delivered in vertical slices while keeping the app
buildable at every step:

1. define typed protocol contracts
2. implement bridge-side workspace reads with containment checks
3. expose the new APIs through the SDK client
4. build the thread-detail workspace browser UI on top of the SDK/bridge surface

The browser UI should keep its state local to the feature. It should not be
added to the shared thread runtime snapshot because:

- it is read-oriented and view-scoped
- it does not need SSE-driven resync orchestration
- large file content should not live in global thread state

## Phase 1: Protocol Additions

**Goal:** Establish typed contracts for workspace browsing.

### New types in `packages/protocol/src/index.ts`

Add:

- `WorkspaceEntry`
- `WorkspaceReadDirectoryRequest`
- `WorkspaceReadDirectoryResponse`
- `WorkspaceReadFileRequest`
- `WorkspaceReadFileResponse`
- `WorkspaceFileKind`

Recommended shapes:

```ts
type WorkspaceEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
};

type WorkspaceReadDirectoryRequest = {
  threadId: string;
  path?: string;
};

type WorkspaceReadDirectoryResponse = {
  root: string;
  path: string;
  entries: WorkspaceEntry[];
};

type WorkspaceFileKind = "text" | "binary" | "unsupported" | "tooLarge";

type WorkspaceReadFileRequest = {
  threadId: string;
  path: string;
};

type WorkspaceReadFileResponse = {
  root: string;
  path: string;
  kind: WorkspaceFileKind;
  sizeBytes?: number;
  modifiedAtMs?: number;
  content?: string;
};
```

Design rules:

- `path` is always workspace-relative in the client-facing contract
- `root` is returned for UI context and debugging clarity
- text files return decoded UTF-8 content
- binary or oversized files omit `content`

## Phase 2: Bridge Workspace Service

**Goal:** Add a read-only workspace browser backend that stays inside thread root
containment.

### New file

Add:

- `apps/bridge/src/workspaceService.ts`

Responsibilities:

- resolve a thread's workspace root from `thread.cwd`
- normalize relative paths from the client
- resolve canonical paths and enforce workspace containment
- read directory entries
- read file contents
- classify preview type

### `AppServerClient` additions

Add low-level methods for upstream filesystem operations:

- `readDirectory(path: string)`
- `readFile(path: string)`
- optionally `getMetadata(path: string)` if needed for file stats

The bridge should call upstream `fs/readDirectory`, `fs/readFile`, and optionally
`fs/getMetadata` rather than reimplementing raw filesystem access in parallel.

### `ThreadService` support

`WorkspaceService` needs authoritative access to the thread root. The smallest
coherent bridge-side approach is:

- add a method on `ThreadService` that returns a thread detail or summary for a
  given `threadId`
- reuse existing thread reading and mapping logic to retrieve `cwd`

Alternative implementation is acceptable if it still avoids duplicating thread
lookup logic across services.

### Containment logic

The bridge must:

1. start from the thread's `cwd`
2. normalize the requested relative path
3. reject absolute client-provided targets
4. resolve the final target path
5. compare the canonical target path against the canonical root path
6. reject any target outside the root

This containment logic must also cover symlink escape cases.

### File classification

Recommended MVP classification:

- if file size exceeds a configured threshold, return `tooLarge`
- if content is not valid UTF-8 text, return `binary`
- otherwise return `text`

The threshold should be conservative, for example 256 KB to 1 MB.

### HTTP routes in `apps/bridge/src/server.ts`

Add authenticated GET routes:

- `/api/workspace/directory`
- `/api/workspace/file`

Recommended query model:

- `threadId`
- `path` (optional for directory root)

Use top-level routes instead of nesting under `/api/threads/:id/...` so the
current `/api/threads/:threadId` detail route does not need awkward wildcard
reordering.

## Phase 3: SDK Client Surface

**Goal:** Expose workspace browsing to the browser client without coupling it to
the thread runtime snapshot.

### `packages/sdk/src/bridgeClient.ts`

Add:

- `readWorkspaceDirectory(request)`
- `readWorkspaceFile(request)`

These methods should reuse the existing authenticated request helper and return
the typed protocol responses.

### `packages/sdk/src/index.ts`

Re-export any new request/response types only if needed by package consumers.
Prefer keeping consumers on `@my-codex-app/protocol` for shared types and using
`BridgeClient` methods directly.

## Phase 4: Client Feature State

**Goal:** Build a local feature-state layer for the workspace browser.

### New client files

Recommended additions under `apps/client/src/features/threads/`:

- `components/workspace-browser-sheet.tsx`
- `components/workspace-tree.tsx`
- `components/workspace-file-preview.tsx`
- `lib/workspace-utils.ts`
- optionally `hooks/use-workspace-browser.ts`

### State model

Keep browser state local to the thread-detail feature:

- `open`
- mobile presentation mode (`files` or `preview`)
- `currentDirectoryPath`
- expanded directories map
- loading/error state per directory fetch
- selected file path
- file preview loading/error/content state

Avoid adding this to `BridgeThreadRuntime`.

## Phase 5: Thread Detail Integration

**Goal:** Integrate the workspace browser into the existing thread detail page.

### Header entry point

Primary integration target:

- `apps/client/src/features/threads/components/thread-detail-panel.tsx`

Add a workspace-browser trigger in the header near:

- `CwdPathDisplay`
- model badge

Recommended trigger copy:

- icon + short label such as `Project`
- mobile can use icon-only with accessible label if needed

### Sheet layout

Desktop:

- right-side sheet
- left column: tree
- right column: preview

Mobile:

- full-screen sheet
- default to `files` mode on open
- switch to `preview` mode when the user selects a file
- allow returning to `files` mode without resetting expanded directory state

### Message-stream deep links

Add optional open-in-browser actions for file-bearing items:

- file-change entries
- mention paths when they resolve to files in the workspace
- image-view/local-image paths when appropriate

The first implementation can focus on file-change entries if that keeps the
slice smaller while preserving the architecture for later extension.

## Phase 6: Preview Rendering Rules

**Goal:** Keep file preview readable with minimal complexity.

### Text files

- Render through existing code/text presentation components
- Use lightweight language inference from file extension
- Preserve line breaks and horizontal overflow handling

### Binary / unsupported / too-large files

- Show filename, relative path, size, and a non-preview message
- Keep copyable path affordances if useful

### Reuse

Reuse existing client presentation helpers where possible:

- `CodeBlock`
- `PlainCodeFallback`
- shared sheet/button/badge primitives

## Task Breakdown

1. Add workspace request/response types to `packages/protocol`.
2. Add upstream filesystem request methods to `apps/bridge/src/appServerClient.ts`.
3. Add a new `WorkspaceService` with root containment checks.
4. Wire authenticated workspace routes into `apps/bridge/src/server.ts`.
5. Add `BridgeClient` methods for directory and file reads.
6. Build client-side workspace browser components and local state helpers.
7. Add a header trigger to `thread-detail-panel.tsx`.
8. Add file-open actions from file-change items into the workspace browser.
9. Tune mobile sheet behavior for full-screen `files` / `preview` modes.
10. Run focused validation and review docs/code consistency.

## Validation Plan

At minimum, run:

- workspace typecheck/build

Focused manual checks:

- open workspace browser from a thread with a valid `cwd`
- expand nested directories lazily
- open a text file and read content
- open a file-change entry directly in the browser
- attempt invalid paths and confirm bridge rejection
- confirm large or binary files degrade to metadata-only preview
- confirm mobile layout remains usable

## Recommended Execution Mode

- `Main agent` is recommended.

Reason:

- the bridge, protocol, SDK, and thread-detail UI changes are tightly coupled
- containment and route design need consistent end-to-end reasoning
- the implementation is substantial, but the write scope overlaps heavily across
  the same small set of modules
