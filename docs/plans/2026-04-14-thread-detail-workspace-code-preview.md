# Thread Detail Workspace Code Preview Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-14-thread-detail-workspace-code-preview.md`

It also remains aligned with:

- `docs/specs/2026-04-12-thread-detail-workspace-browser.md`
- `docs/specs/2026-04-11-thread-detail-markdown-rendering.md`
- `docs/specs/2026-04-13-client-modular-refactor.md`
- `docs/plans/2026-04-12-thread-detail-workspace-browser.md`

This plan is intentionally client-only.

## Implementation Strategy

The smallest coherent implementation is to keep the current workspace browser
data flow and upgrade only the preview rendering layer in `apps/client`.

The work should avoid broad rewrites and instead proceed in three tight layers:

1. introduce a dedicated read-only code viewer abstraction
2. expand supported language registration and path inference
3. switch workspace file preview to the new viewer and validate desktop/mobile
   behavior

The implementation should preserve the current preview state machine:

- `idle`
- `loading`
- `error`
- `ready`

Only the `ready + text` rendering path needs to change materially.

## Phase 1: Add A Dedicated Code Viewer

**Goal:** separate workspace file viewing needs from the current generic
Markdown/message code block surface.

### New shared component

Add a dedicated component under `apps/client/src/components/common/`, for
example:

- `code-viewer.tsx`

Responsibilities:

- render read-only source text
- accept `language`
- accept optional `highlightLine`
- support line numbers
- preserve copy support if retained
- prefer horizontal scrolling over long-line wrapping
- keep theme-aware styling aligned with the current product language

### Relationship To Existing `CodeBlock`

Recommended rule:

- keep `CodeBlock` as the lightweight shared block used by markdown/message
  rendering
- avoid silently changing its default behavior in a way that alters message
  timeline rendering
- allow the new viewer to reuse internal helpers only if the public behavior
  stays clearly separated

## Phase 2: Expand Language Registration

**Goal:** support the common project file types that users expect inside the
workspace browser.

### `apps/client/src/components/common/code-viewer.tsx`

Register the required Prism languages for the first supported set:

- `typescript`
- `tsx`
- `javascript`
- `jsx`
- `json`
- `python`
- `java`
- `go`
- `rust`
- `bash`
- `yaml`
- `toml`
- `markdown`
- `css`
- `scss`
- `markup` or the closest Prism language used for `html` / `xml`

Also add a local alias table so multiple extension names can resolve to the
same highlighter language.

### `apps/client/src/features/threads/lib/workspace-utils.ts`

Expand `LANGUAGE_BY_EXTENSION` to cover at least:

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
- `md`, `markdown`
- `css`, `scss`
- `html`, `xml`

Optional if inexpensive:

- special basename mapping such as `Dockerfile`
- `.env`-style plain-text classification with no language

Design rules:

- keep inference deterministic and path-based
- do not inspect content to guess language in this slice
- return `undefined` when a text file should render as plain text

## Phase 3: Integrate Workspace Preview

**Goal:** make workspace text files render through the dedicated code viewer.

### `apps/client/src/features/threads/components/workspace-file-preview.tsx`

Change the text-file branch to:

- use `CodeViewer`
- pass inferred `language`
- pass `highlightLine`
- retain the current filename/path/metadata header

Do not change:

- loading UI
- error UI
- binary / unsupported / too-large UI model

### Rendering behavior

Desktop:

- show line numbers by default
- preserve the current scrollable preview pane
- keep requested-line highlight behavior

Mobile:

- reuse the same viewer inside the existing preview pane
- keep line numbers if they remain readable; if density is poor, allow a small
  mobile-specific variant that still preserves code readability and syntax
  highlighting

## Phase 4: Style Tuning And Guardrails

**Goal:** make the preview read clearly as source code without drifting the rest
of the UI.

Potential touched files:

- `apps/client/src/index.css`
- `apps/client/src/components/common/code-viewer.tsx`

Tasks:

- ensure code background, border, and mono typography stay aligned with theme
- tune line-number contrast so it is readable but visually secondary
- confirm horizontal scrolling is available and does not break the preview pane
- keep line highlight styling visible in both light and dark themes

## Task Breakdown

1. Create a dedicated shared read-only `CodeViewer` component.
2. Register the initial supported Prism languages for workspace code preview.
3. Add/expand language aliases used by the viewer.
4. Expand workspace file extension inference in
   `features/threads/lib/workspace-utils.ts`.
5. Switch `workspace-file-preview.tsx` text rendering to `CodeViewer`.
6. Preserve current line-highlight behavior for file references with anchors.
7. Tune desktop and mobile preview styling.
8. Review affected docs/code for consistency.

## Validation Plan

At minimum, run:

- `pnpm --filter @my-codex-app/client typecheck`
- `pnpm --filter @my-codex-app/client build`

Focused manual checks:

- open a `.ts` file and confirm syntax highlighting
- open a `.js` file and confirm syntax highlighting
- open a `.rs` file and confirm syntax highlighting
- open a `.json` file and confirm syntax highlighting
- open a `.py` file and confirm syntax highlighting
- open a `.java` file and confirm syntax highlighting
- open a `.go` file and confirm syntax highlighting
- open a text file with an unknown extension and confirm plain-text fallback
- open a long-line source file and confirm horizontal scrolling works
- open a file link with `#L<number>` and confirm the target line is highlighted
- confirm binary / too-large files still show metadata-only states
- inspect desktop and mobile-width layouts for readability

## Risks And Mitigations

### Risk: Prism language import mismatch

Mitigation:

- keep the initial language set explicit and verify imports during build
- prefer the already-used Prism async-light stack over mixing renderers

### Risk: regressions in message timeline code blocks

Mitigation:

- keep workspace preview on a dedicated viewer component
- avoid broad default-behavior changes in the current `CodeBlock`

### Risk: too much viewer chrome on mobile

Mitigation:

- keep mobile adjustments local to the viewer
- prioritize readable code content over decorative editor framing

## Rollback Strategy

Because this is a client-only presentation change, rollback is straightforward:

- restore workspace preview text rendering to the previous component path
- keep language-mapping additions only if they remain harmless, or remove them
- leave bridge, SDK, and protocol unchanged

## Recommended Execution Mode

- `Main agent` is recommended.

Reason:

- the write scope is concentrated in a small set of client modules
- behavior, styling, and language-mapping changes overlap in the same files
- the task is substantial enough for planning, but not well-shaped for parallel
  sub-agent execution
