# Thread Detail Workspace Code Preview Spec

## Relationship To Existing Docs

This spec extends and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-11-thread-detail-markdown-rendering.md`
- `docs/specs/2026-04-13-client-modular-refactor.md`

This slice does not change:

- bridge or SDK request/response contracts
- upstream Codex app-server integration behavior
- workspace containment rules
- thread, turn, request, or reconnect lifecycle semantics

The scope is a client-side presentation upgrade for workspace file preview in
`apps/client`.

## Background

The current workspace browser already lets users browse directories and open
text files from the active thread workspace. That closes the basic inspection
loop, but the preview experience still feels closer to a generic Markdown code
block than to a code-oriented file viewer:

- only a small language subset is registered today, so many common project
  files fall back to plain text styling
- file previews wrap long lines by default, which weakens source-code scanning
  for files with indentation, structured literals, or long import statements
- the current preview lacks line numbers and code-view-specific affordances that
  help users inspect file references mentioned in the thread
- the product already handles mostly code and config files such as `.ts`,
  `.js`, `.rs`, `.json`, `.py`, `.java`, and `.go`, so a richer read-only code
  viewer is a better default than a prose-oriented renderer

The goal is to make workspace file preview feel intentionally code-first
without expanding the feature into a full IDE or editor.

## Goals

- Render text file previews in the workspace browser as a read-only code view
  rather than a Markdown-like content block.
- Support syntax highlighting for the most common source and configuration files
  encountered in Codex workspaces.
- Improve scanability with editor-like read affordances such as line numbers,
  stable monospace layout, and horizontal scrolling for long lines.
- Reuse the current client-side rendering stack where practical to keep risk and
  implementation cost low.
- Keep desktop and mobile behavior aligned while preserving the existing
  workspace browser layout model.

## Non-Goals

- Editing files in place.
- Adding Monaco, CodeMirror, or another full editor runtime in this slice.
- Introducing tabs, minimap, code folding, search-in-file, symbol navigation,
  or inline diagnostics.
- Changing bridge-side file classification or file-reading behavior.
- Providing semantic language tooling or language-server-backed highlighting.
- Redesigning the overall workspace browser sheet, tree, or thread-detail page.

## Scope

### In Scope

- a dedicated read-only code preview component for workspace text files
- broader syntax-highlighting language registration in `apps/client`
- broader path-to-language inference for common code and config files
- line numbers and file-view-oriented preview styling
- preserving targeted line highlighting when the browser opens from a thread
  file reference
- graceful fallback to plain-text code presentation when a language is unknown

### Out Of Scope

- non-text preview expansion for binary assets
- bridge or protocol changes
- message-timeline markdown rendering changes outside reuse of shared helpers
- replacing the existing file preview loading/error/metadata states

## User Experience Requirements

### General Preview Behavior

- Text files should open inside a read-only code viewer presentation.
- The preview should visually read as a file viewer, not as prose content or a
  Markdown article block.
- Unknown-but-text files should still render in a stable monospace viewer with
  line numbers and preserved whitespace.

### Syntax Highlighting

- Common source files should receive syntax highlighting when their language can
  be inferred reliably from the path.
- The first supported set must cover at least:
  - `ts`, `tsx`
  - `js`, `jsx`, `mjs`, `cjs`
  - `json`, `jsonc`
  - `rs`
  - `py`
  - `java`
  - `go`
  - `sh`, `bash`, `zsh`
  - `yaml`, `yml`
  - `toml`
  - `md`
  - `css`, `scss`
  - `html`, `xml`
- If a file extension is not recognized but the file is text, preview should
  fall back to plain-text rendering rather than failing or switching to
  Markdown parsing.

### Code Viewer Affordances

- Desktop preview should show line numbers by default.
- Long lines should prefer horizontal scrolling over forced wrapping.
- Existing targeted line highlight behavior should remain supported when the
  browser opens a file from a thread reference with line information.
- Copy-file-content behavior may remain available, but it should not dominate
  the reading experience.

### Mobile Behavior

- Mobile should keep the current `files` / `preview` drill-in presentation.
- The code preview should remain readable within the mobile preview pane without
  requiring desktop-only chrome.
- Mobile may omit some dense desktop affordances if needed for readability, but
  it must still preserve syntax highlighting and whitespace fidelity.

### Non-Previewable Files

- Binary, unsupported, and too-large file handling should remain unchanged in
  principle.
- Metadata-only states should still show filename, relative path, and
  explanatory messaging.

## Technical Direction

The recommended implementation direction for this slice is:

- keep `react-syntax-highlighter` as the rendering engine
- continue using the Prism async-light path already present in `apps/client`
- introduce a dedicated read-only `CodeViewer` abstraction for workspace file
  preview instead of overloading the current generic `CodeBlock` behavior
- centralize language aliasing and extension inference so workspace preview and
  any future code-view surfaces use one mapping model

This direction is preferred because it:

- builds on dependencies already in the repo
- avoids a heavier editor runtime for a read-only feature
- keeps the current bundle and implementation risk lower than switching to a new
  highlighting stack in the same slice
- leaves open the option to swap the underlying renderer later without changing
  workspace-browser feature boundaries

## Component Responsibilities

### Shared Code Viewer

A shared read-only code-view component should:

- accept raw text content
- accept an optional inferred language
- support line numbers
- support line highlighting for one requested line
- preserve whitespace and indentation
- allow horizontal scrolling for long lines
- expose styling variants only if they are genuinely needed by multiple call
  sites

### Workspace File Preview

The workspace file preview surface should:

- keep ownership of loading, error, metadata, and non-preview states
- delegate text-file rendering to the new code-view component
- continue inferring language from workspace-relative file path

### Language Inference

Language inference should:

- remain client-side
- use deterministic path-based mapping
- prefer simple, explicit extension mapping over heuristic content parsing
- support extension aliases that map to the same renderer language

## Performance And Bundle Constraints

- The implementation should stay within the current lightweight viewer model.
- It should not require mounting a full editor runtime per preview.
- Additional language registration should be limited to a practical, explicit
  set rather than attempting to preload every supported grammar.
- Large files should continue using existing bridge-side size classification and
  metadata-only fallback behavior.

## Compatibility Constraints

- The feature must remain compatible with the current browser-first client.
- The feature must continue to work in a future Tauri mobile shell without
  desktop-only assumptions.
- The implementation must preserve the current workspace browser API surface and
  file preview state model.
- Existing thread-to-file deep links and request-line highlighting behavior must
  continue to function.

## Risks

### Risk: language coverage drift

- Users may assume any text file will have perfect syntax coloring.

Mitigation:

- define an explicit supported language set for this slice
- ensure plain-text fallback remains readable

### Risk: shared component coupling

- A workspace-specific viewer could accidentally disturb message-timeline code
  rendering if implemented by heavily mutating the current generic `CodeBlock`.

Mitigation:

- add a dedicated code-view abstraction or a clearly separated variant instead
  of retrofitting all behavior into one shared default

### Risk: mobile density

- Desktop-style file-view chrome can feel cramped on small screens.

Mitigation:

- keep mobile layout focused on readable code content first
- only retain affordances that materially help inspection

## Acceptance Criteria

- Opening a text file in the workspace browser renders a read-only code view.
- `.ts`, `.js`, `.rs`, `.json`, `.py`, `.java`, and `.go` files receive syntax
  highlighting.
- The initial supported set also includes common shell, YAML, TOML, Markdown,
  CSS, HTML, and XML files.
- Line numbers are visible in desktop preview for text files.
- Long code lines scroll horizontally instead of being forcibly wrapped.
- Opening a file reference with a line anchor still highlights the requested
  line.
- Unknown text files still render as readable plain text in the same code-view
  shell.
- Binary, unsupported, and too-large files still degrade to metadata-only
  states.
