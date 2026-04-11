# Thread Detail Markdown Rendering Spec

## Relationship To Existing Platform Docs

This spec refines the current client experience defined in:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-10-client-frontend-rebuild.md`

It does not change bridge APIs, protocol shape, or SDK responsibilities. It defines a
presentation-layer enhancement for thread detail content rendering in `apps/client`.

## Background

The current thread detail view renders most turn content as plain text blocks. This
keeps the implementation simple, but it creates several problems for real Codex usage:

- assistant replies that contain Markdown lose visual structure
- code snippets and shell commands are not syntax highlighted
- long formatted answers are harder to scan on both desktop and mobile
- command and reasoning output are readable but visually flat

Codex threads often contain Markdown-formatted explanations, fenced code blocks,
inline code, lists, and command examples. The client should render that content in a
way that preserves structure and improves readability without changing the underlying
thread data model.

## Goals

- Render Markdown-formatted turn content in the thread detail timeline.
- Preserve paragraph, heading, list, quote, table, and fenced-code formatting.
- Provide syntax highlighting for code blocks and shell-style command snippets.
- Keep the current dark product aesthetic and avoid generic documentation-page styling.
- Improve readability without introducing transport, protocol, or data-model changes.

## Non-Goals

- Redesigning the full thread detail layout.
- Changing bridge or SDK payloads.
- Introducing rich-text editing to the composer.
- Rendering arbitrary raw HTML embedded in messages.
- Building a general-purpose markdown package in `packages/ui`.

## Scope

### In Scope

- assistant message Markdown rendering
- user text message Markdown rendering for `UserInput` entries of type `text`
- shared styling for inline code, fenced code, links, lists, blockquotes, and tables
- syntax highlighting for fenced code blocks
- improved presentation for command text in command execution items
- ANSI-colored terminal output rendering for command output blocks
- preserving line breaks and whitespace for non-Markdown fallback content

### Out Of Scope For This Slice

- file diff semantic highlighting
- Markdown rendering in inbox cards, thread list previews, or connection page
- server-side rendering or precomputation of message HTML

## User Experience Requirements

### Assistant messages

- Assistant messages must render Markdown rather than raw plain text.
- Headings, paragraphs, bullet lists, numbered lists, blockquotes, links, and tables
  must be visually distinct and readable within the existing timeline card layout.
- Fenced code blocks must preserve formatting and be visually separated from surrounding
  prose.
- Inline code must be visually distinct from surrounding body text.

### User text messages

- User text content should render using the same Markdown rules as assistant messages.
- Non-text user inputs such as image, skill, mention, and local-image references should
  continue using structured text presentation rather than being merged into Markdown.

### Command execution items

- The command string shown in a command execution card should render in a syntax-aware,
  shell-oriented code style rather than plain text.
- Aggregated command output should preserve line breaks and whitespace.
- If command output contains ANSI terminal color sequences, the client should render a
  readable terminal-style color presentation rather than exposing raw escape codes.

### Reasoning and raw detail blocks

- Reasoning summary may remain structurally simple.
- Expanded reasoning content should use the shared Markdown renderer only when the
  content appears intentionally Markdown-like.
- Reasoning content that is indentation-sensitive, terminal-like, or otherwise likely
  to lose meaning under Markdown parsing should fall back to preformatted text.
- Unknown/raw payload views must remain raw and inspectable.

## Rendering Model

### Markdown source

The client should treat message strings as Markdown source text at render time.

Supported features should include:

- standard Markdown paragraphs and headings
- fenced code blocks
- inline code
- links
- lists
- blockquotes
- tables, task lists, and strikethrough via GitHub Flavored Markdown

### Security expectations

- Raw HTML embedded in Markdown must not be rendered as live HTML in this slice.
- The rendering approach must stay compatible with a safe-by-default React rendering
  model and must not require direct `dangerouslySetInnerHTML` usage for message bodies.
- Terminal ANSI rendering may use a dedicated library that safely converts escaped
  terminal sequences into styled output, as long as that path remains scoped to command
  output presentation rather than general message Markdown.

## Recommended Technical Direction

The recommended implementation direction for this slice is:

- `react-markdown` as the Markdown renderer
- `remark-gfm` for GitHub Flavored Markdown support
- `react-syntax-highlighter` for fenced-code syntax highlighting
- `ansi-to-html` for command-output ANSI interpretation
- optional local Tailwind typography-style utilities for content spacing and readable
  defaults

This combination is intentionally chosen for low integration risk in a Vite + React
client with live-rendered message content.

## Component Responsibilities

### New shared renderer component

A dedicated message-rendering component should:

- accept raw message text
- render Markdown with controlled component overrides
- centralize styling for prose, code, and preformatted blocks
- be reusable across assistant, user-text, and shell-command presentations where
  appropriate

### Thread detail integration

`thread-detail-panel` should remain the orchestration surface for timeline item
selection, while delegating rich text rendering to smaller components.

## Error Handling And Fallback Behavior

- If Markdown parsing or syntax highlighting cannot determine a language, the code block
  should still render as readable plain preformatted text.
- Empty assistant messages should continue to show a fallback such as `No text returned.`
- Unsupported content should degrade to readable text rather than blank output.
- If rich rendering assets are not yet loaded on the client, the UI may temporarily fall
  back to readable plain-text or preformatted rendering rather than blocking the thread
  detail view.

## Compatibility Constraints

- The change must work inside the existing browser-first client architecture.
- The implementation must remain compatible with the shared Web client running later in
  a Tauri mobile host.
- The enhancement must not require new bridge endpoints or protocol fields.

## Risks

### Rendering complexity

- Rich content rendering can add visual noise if not scoped carefully to the existing
  card layout.

### Bundle size

- Markdown and syntax-highlighting dependencies increase client bundle size. The chosen
  libraries should therefore favor integration simplicity and predictable runtime
  behavior over maximal feature breadth.

### Content ambiguity

- Some thread content is prose-like but not authored as formal Markdown. The renderer
  should still produce readable output without making malformed text look broken.

## Acceptance Criteria

- Assistant messages in thread detail render Markdown structure instead of plain text.
- User text message content in thread detail also supports Markdown rendering.
- Fenced code blocks render with syntax highlighting and preserved formatting.
- Inline code is visually distinct from surrounding text.
- Command strings display in a shell-oriented code presentation.
- Command output keeps line breaks and whitespace and renders ANSI color escapes when
  present.
- No bridge, SDK, or protocol changes are required for the feature.
