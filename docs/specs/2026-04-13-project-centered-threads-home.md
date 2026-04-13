# Project-Centered Threads Home Spec

## Relationship To Existing Docs

This spec extends and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-11-local-direct-reconnect-and-resync.md`
- `docs/specs/2026-04-11-local-pairing-device-trust-session-auth.md`
- `docs/specs/2026-04-12-client-ui-refactor.md`
- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-13-client-modular-refactor.md`

This spec supersedes the `/threads` information architecture described in:

- `docs/specs/2026-04-12-client-ui-refactor.md`

Specifically, it replaces the current thread-first main workspace with a
project-first main workspace while preserving the existing auth guard, header,
request sheet, settings sheet, and thread detail route model.

This iteration changes:

- the user-facing information architecture of `/threads`
- the bridge/client protocol surface above raw thread listing
- the bridge-side persistence model for manually imported projects

This iteration does not change:

- upstream Codex `thread/start`, `thread/read`, `thread/resume`, or turn
  semantics
- pairing, session refresh, reconnect, or pending-request semantics
- the existing thread-detail workspace browser behavior

## Background

The current `/threads` page is still organized around a flat thread list. That
worked for the first usable slice, but it is now mismatched with the actual user
workflow of remote Codex usage.

For normal development work, users think in projects first:

- "Which project am I looking at?"
- "Do I want to resume an old session in this project?"
- "Do I want to start a new session in this project?"

The current page forces the reverse workflow:

- users land in a large mixed thread list
- project identity is visually secondary
- finding the right project requires scanning thread cards
- starting a session in a specific project is not a first-class action

The current grouping is also semantically weak. The client groups by the last
path segment of `thread.cwd`, which means unrelated projects with the same leaf
directory name can collapse into one visual group.

At the same time, the product already has the core building blocks needed for a
better model:

- upstream Codex supports `thread/start` with `cwd`
- upstream Codex supports `thread/list` filtered by `cwd`
- thread detail already treats `thread.cwd` as the active project workspace

The missing piece is a first-class project layer between the user and the raw
thread list.

## Goals

- Make `/threads` a project-centered home rather than a thread wall.
- Optimize the page flow for mobile first, with desktop as a widened version of
  the same information architecture.
- Let users clearly distinguish projects before choosing a session.
- Let users start a new session inside a chosen project as a primary action.
- Let users import a project by path even when no session for that project
  exists yet.
- Keep imported projects bridge-authoritative so all paired devices see the same
  project list.
- Preserve the existing thread detail, request handling, and workspace browser
  semantics once the user enters a specific session.

## Non-Goals

- Replacing thread detail with a project-level IDE or file editor.
- Adding arbitrary host filesystem browsing from the browser as a general
  feature.
- Implementing full-disk recursive fuzzy search for project import.
- Changing upstream Codex thread lifecycle, request lifecycle, or event stream
  semantics.
- Introducing a new top-level `/projects` route in this slice.
- Reworking the visual theme or design system.

## Product Model

### Project

A project is the first-class object shown on the main `/threads` screen.

A project is identified by a normalized absolute path, ultimately derived from
`cwd`.

A project may originate from one or both of:

- `derived`
  From one or more existing threads whose `cwd` resolves to that project path.
- `imported`
  From an explicit user import action, even if the project has zero sessions.

A project remains valid even when it has zero sessions, as long as it has been
explicitly imported and still resolves to a valid directory.

### Session

A session is the user-facing presentation of a Codex thread within one project.

Sessions remain the same underlying thread objects already used by the bridge,
SDK, and thread detail route. This spec changes how users discover and select
them, not what a session is.

### Project Identity Rules

- Project identity must not be derived from only the last path segment.
- The bridge is responsible for canonical path validation for imported projects.
- The client must treat the bridge-returned project path as the canonical
  identity key.
- If a project has both imported state and existing threads, it is still one
  project in the UI.

## Route Model

The app keeps the existing route surface:

- `/threads`
- `/threads/:threadId`

The route model remains thread-addressable for deep links and request-sheet
navigation, but the default browsing surface at `/threads` becomes project
first.

## User Experience Requirements

### Primary Information Architecture

The main `/threads` experience must follow this hierarchy:

1. Projects
2. Sessions within a selected project
3. Thread detail for a selected session

The default landing view must emphasize projects rather than a mixed list of all
threads.

### Mobile Navigation

Mobile is the primary design target.

The mobile flow must behave like:

- `projects`
- `project sessions`
- `thread detail`

Required mobile properties:

- users land on the project list by default
- selecting a project opens a dedicated sessions view for that project
- selecting a session opens thread detail full-screen
- users can move back one level at a time without losing prior context
- importing a project must be possible without leaving the mobile flow

### Desktop Navigation

Desktop must be a widened form of the same hierarchy rather than a separate
product model.

The recommended desktop structure is:

- left column: projects
- middle column: sessions for the selected project
- right column: thread detail

Desktop may keep the thread route visible in the URL, but the visible page
structure must still make projects the primary first scan target.

### Projects Home

The projects surface must:

- show projects before sessions
- avoid rendering all sessions across all projects in one continuous list
- provide a clear "import project" action
- provide fast visual scanning for recent activity and waiting work

Each project row or card must include enough information for quick triage,
including:

- display name derived from the path
- canonical or full project path in secondary text
- recent activity indicator
- session count
- pending request count
- whether any session is currently active

Projects should be ordered primarily by recent activity, with imported but
inactive projects still visible after recently active projects.

### Project Sessions View

Selecting a project must reveal only sessions for that project.

This sessions view must:

- make "new session in this project" the primary action
- support light-weight local filtering and sorting within that project's
  sessions
- clearly separate an imported-but-empty project from a project with session
  history

An imported project with zero sessions must still have a meaningful empty state
with a prominent action to start its first session.

### Thread Detail

Thread detail remains the final level of the flow.

This spec does not redesign the current thread detail message stream, composer,
pending requests, or workspace browser. Those surfaces should be reused as much
as possible once a session is selected.

### Import Project Flow

Importing a project is a first-class flow.

The user flow is:

1. trigger import from the projects surface
2. enter a path
3. inspect search or completion suggestions
4. select or submit a path
5. let the bridge validate and import the project
6. land in that project's sessions view

Import requirements:

- path input is the primary input mechanism
- the flow must support search or completion while typing
- search results must include already known projects when relevant
- the bridge must validate that the submitted path resolves to a real directory
  before import succeeds
- successful import must not require that a session already exists

### Search Requirements

Project import search in this slice is bounded and path-oriented.

Required support:

- search across known projects by display name and path
- bridge-assisted path completion or path suggestion for typed path prefixes

Not required in this slice:

- full recursive search across the entire filesystem
- content-aware or git-aware project discovery
- arbitrary filesystem browsing trees from the import modal

## Bridge Authority And Persistence

Imported projects must be bridge-authoritative state.

Rules:

- imported project records must be persisted by the bridge
- imported projects must not live only in browser local storage
- all paired clients against the same bridge must observe the same imported
  project registry
- imported project persistence must be separate from thread persistence semantics

Derived project information may be computed from current thread summaries, but
the unified project list presented to the client must come from the bridge as a
single authoritative view.

## Protocol Requirements

The bridge-facing protocol needs a first-class project layer.

### Required Project Capabilities

The shared protocol must add typed request or response shapes for:

- listing projects
- searching known projects and path candidates for import
- importing a project by path

The bridge-facing project list response must be rich enough for the client to
render:

- canonical project path
- display name
- whether the project is imported
- whether the project has derived thread history
- session count
- pending request count
- recent activity information

### Required Session Filtering Capability

The client-facing `thread/list` contract must support at least:

- `cwd` filtering

This is required so the sessions view can fetch only the sessions for the
selected project rather than carrying the entire global thread wall into the new
layout.

### Reuse Of Existing Start Semantics

The project sessions view must continue to start new sessions by calling the
existing thread start flow with `cwd`.

This spec does not introduce a separate project-scoped session-start protocol.

## Security And Validation Requirements

- Project import and search must require the same authenticated bridge session
  model as the rest of the app.
- The client must never be trusted as the authority on whether a path exists or
  is importable.
- The bridge must canonicalize and validate submitted import paths.
- The bridge must reject non-directory targets.
- The bridge must keep import search bounded in depth and result count.
- The bridge must not expose arbitrary file contents through project import
  search.

## Error Handling And Fallback Behavior

- Invalid paths must return a clear validation error.
- Unreadable or missing directories must fail import gracefully.
- If a previously imported project later becomes unavailable, the project should
  still render with an unavailable state rather than silently disappearing.
- Deep links to `/threads/:threadId` must still work even if the surrounding
  project list has not been loaded yet.

## Performance Constraints

- The main projects surface must not render all sessions for all projects at
  once.
- Session lists should load per selected project.
- Thread detail should continue to load lazily for the selected thread only.
- Import search must be bounded and must not perform unbounded recursive scans
  of the filesystem.

## Compatibility Constraints

- The browser and future Tauri mobile shell must use the same project-centered
  information architecture.
- The bridge remains the only component that talks directly to Codex app-server.
- The relay architecture remains unchanged.
- Existing request sheet and settings sheet interactions must continue to work
  without requiring a separate inbox or connection page.

## Acceptance Criteria

- Opening `/threads` on mobile shows a projects-first surface rather than a flat
  list of threads.
- Users can select an existing project and start a new session in that project.
- Users can import a project by path even when that project has no sessions yet.
- Imported projects are visible across paired clients because the bridge stores
  them authoritatively.
- Session lists are scoped to the selected project rather than mixing all
  project sessions together.
- Project identity is path-based, so same-name leaf directories are no longer
  merged into one visual project.
- Deep-linking to `/threads/:threadId` still opens the correct thread detail and
  resolves the surrounding project context.
