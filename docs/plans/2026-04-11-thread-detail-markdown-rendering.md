# Thread Detail Markdown Rendering Technical Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-11-thread-detail-markdown-rendering.md`

It remains aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-10-client-frontend-rebuild.md`
- `docs/plans/2026-04-10-client-frontend-rebuild.md`

## Implementation Approach

This is a client-only presentation enhancement. The implementation should modify the
thread detail rendering path in `apps/client` without changing:

- bridge request/response contracts
- `packages/protocol` types
- `packages/sdk` runtime behavior

The work should be delivered as a focused UI enhancement with a reusable Markdown
rendering component rather than as ad hoc inline formatting logic inside
`thread-detail-panel.tsx`.

## Recommended Dependencies

Add to `apps/client`:

- `react-markdown`
- `remark-gfm`
- `react-syntax-highlighter`
- `ansi-to-html`

Optional, only if the local styling pass clearly benefits from it:

- `@tailwindcss/typography`

The initial implementation should avoid heavier Markdown/highlighting stacks such as
`rehype-pretty-code` or `shiki`, because this view renders live thread content at
runtime and does not need a build-time documentation pipeline.

## Proposed Module Changes

## New components

Add a small message-rendering surface under the client codebase, for example:

```text
apps/client/src/components/common/
  markdown-content.tsx
  code-block.tsx
```

Responsibilities:

- `markdown-content.tsx`
  - wrap `react-markdown`
  - enable `remark-gfm`
  - define controlled renderers for `p`, `a`, `ul`, `ol`, `li`, `blockquote`,
    `table`, `pre`, `code`, and headings
  - expose variants if needed for regular prose vs denser auxiliary content

- `code-block.tsx`
  - render fenced code blocks through `react-syntax-highlighter`
  - detect declared language from Markdown class names such as `language-ts`
  - fall back to plain preformatted styling when no language is present
  - provide a shell-oriented mode for command cards where appropriate

- terminal output renderer
  - convert ANSI-colored output to styled HTML through a dedicated library
  - keep conversion scoped to command output, not generic Markdown rendering
  - preserve whitespace and multiline terminal readability

- lazy rich-content loading
  - defer markdown/code/terminal renderer code until rich content is actually needed
  - keep a readable fallback while the renderer chunk is loading
  - reduce the base thread-detail bundle cost

## Existing file changes

Primary integration target:

- `apps/client/src/features/threads/components/thread-detail-panel.tsx`

Expected changes:

- replace assistant plain-text rendering with `MarkdownContent`
- render user text inputs with `MarkdownContent`
- keep structured non-text user inputs as explicit labels
- render reasoning detail with a conservative heuristic:
  - Markdown-like content may use `MarkdownContent`
  - otherwise keep preformatted text to preserve exact formatting
- route command string rendering through the shared code block presentation
- render aggregated command output through a terminal-output-specific presentation

Potential styling support file:

- `apps/client/src/index.css`

Expected changes:

- add any shared markdown/content utility classes that are awkward to express inline
- keep styles aligned with the existing dark visual language

## Rendering Rules

### Assistant message renderer

Input:

- `item.text`

Behavior:

- if empty, render fallback text
- otherwise pass through `MarkdownContent`

### User message renderer

Input:

- `item.content`

Behavior:

- for `text` entries, render with `MarkdownContent`
- for non-text entries, continue current structured text formatting
- preserve ordering of mixed inputs

### Code renderer

Behavior:

- inline code uses a compact mono badge-like style
- fenced code uses syntax highlighting and horizontal overflow handling
- unknown language uses plain mono block styling without failing the render

### Command renderer

Behavior:

- render `item.command` in shell mode
- keep terminal framing already present in the UI
- render `item.aggregatedOutput` in a scrollable terminal block
- if ANSI escape sequences are present, convert them to styled terminal output
- if no ANSI escape sequences are present, still preserve whitespace and multiline flow

### Diff and raw payload renderer

Behavior:

- semantic diff parsing is still out of scope
- diff text may still use syntax-colored code-block presentation for readability
- unknown payload JSON may use syntax-colored code-block presentation while remaining
  raw and inspectable

## Suggested Rendering Logic

High-level flow:

1. Parse Markdown through `react-markdown`.
2. Enable GFM features through `remark-gfm`.
3. Intercept `code` nodes.
4. If inline, render compact styled `<code>`.
5. If block, extract language and render via `react-syntax-highlighter`.
6. Apply consistent spacing and typography classes to other Markdown elements.

Pseudo-structure:

```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    p: ...,
    a: ...,
    code: ({ inline, className, children }) => {
      if (inline) return <InlineCode />;
      return <CodeBlock language={parseLanguage(className)}>{children}</CodeBlock>;
    },
    pre: ({ children }) => <>{children}</>,
  }}
>
  {content}
</ReactMarkdown>
```

## Task Breakdown

1. Add Markdown and syntax-highlighting dependencies to `apps/client`.
2. Create a reusable Markdown rendering component with controlled element mappings.
3. Create a reusable highlighted code block component with fallback behavior.
4. Integrate the renderer into assistant message items.
5. Integrate the renderer into user text message items.
6. Route command text through the shared code-block presentation.
7. Add a terminal output renderer for ANSI-colored command output.
8. Review reasoning/detail blocks and keep only the safe minimum Markdown usage.
9. Tune spacing, overflow, and dark-theme colors for mobile and desktop readability.
10. Defer rich renderers behind lazy-loaded boundaries to limit thread-detail bundle
    cost.
11. Run typecheck/build validation and do a focused visual review of the thread detail
   timeline.

## Validation Plan

At minimum, run:

- client typecheck
- client production build

Recommended focused manual checks:

- assistant message with paragraphs, headings, lists, links, inline code, and fenced
  code
- user message containing Markdown text
- assistant code block with explicit language
- assistant code block without language
- command execution item with long command text
- command output with multiple lines
- command output containing ANSI color sequences
- file diff and unknown raw payload still render correctly
- mobile-width and desktop-width thread detail inspection

## Risks And Mitigations

### Risk: Styling drift from current product language

Mitigation:

- keep rendering styles scoped to message content containers
- preserve existing timeline cards and only enhance inner content presentation

### Risk: Bundle growth from syntax highlighting

Mitigation:

- start with a minimal dependency set
- only revisit lighter or more advanced alternatives if bundle cost becomes visible

### Risk: Over-rendering malformed Markdown

Mitigation:

- rely on tolerant Markdown parsing
- fall back to readable plain text for unsupported or ambiguous content

## Rollback Strategy

Because this feature is presentation-only, rollback is straightforward:

- remove the Markdown rendering component usage
- restore previous plain-text rendering in thread detail
- keep protocol and runtime untouched

## Definition Of Done

- Spec-approved implementation path exists.
- Plan is specific enough to execute without revisiting architecture.
- The eventual implementation will remain client-only and protocol-compatible.
- Validation scope is defined before coding starts.
