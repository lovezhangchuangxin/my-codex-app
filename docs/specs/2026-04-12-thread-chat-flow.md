# Thread Detail: Continuous Chat Flow

## Background

The current thread detail page renders conversations as an Accordion-based "Turn activity" timeline. Each Turn is a collapsible section showing turn ID, status badge, timestamps, and nested items. This creates a debugging-tool feel rather than a natural conversation experience.

The goal is to flatten the Turn structure into a continuous message stream, similar to Codex / Claude Code / Paseo, where users perceive an ongoing conversation without explicit turn boundaries.

## Scope

### In scope

- Rewrite `thread-detail-panel.tsx` to render a flat, continuous message stream
- Add `flattenTurnItems()` utility to `thread-utils.ts`
- Simplify `message-input.tsx` composer styling

### Out of scope

- Data model, API, SDK, or protocol layer changes (Turn concept remains in the protocol)
- `PendingRequestList` component
- `ThreadListPanel` component
- Connection state banner
- Mobile thread switcher
- Virtual scrolling (can be added later if needed)
- Streaming/delta rendering (future enhancement)

## Design

### Message flow

All turn items are flattened into a single ordered list. Each item renders directly without a Turn wrapper. User messages and agent messages have distinct visual styles. Tool calls appear as inline cards.

### Message styles

| Item type | Style |
|-----------|-------|
| `userMessage` | Right-aligned chat bubble, user avatar icon, content rendered directly |
| `agentMessage` | Left-aligned, agent avatar icon, markdown rendered directly |
| `reasoning` | Left-aligned, compact collapsible block, "Thinking..." indicator |
| `commandExecution` | Terminal-style inline card, output collapsed by default |
| `fileChange` | File change card, diff collapsed by default |
| `webSearch` | Inline small label |
| `imageView` | Inline small label |

### Header simplification

- Remove "Turn activity" heading and "Timeline" sub-heading
- Remove the Turns/Requests/Updated statistics bar
- Keep: thread title, workspace, model badge, status badge, pending count
- Pending requests section remains above the message stream

### Input area

- More compact send button
- "Interrupt turn" text button replaced with a Stop square icon button
- Remove "Live thread" text label, use a subtle pulse indicator instead
- Remove character count

### Auto-scroll

- New messages auto-scroll to bottom when user is already near bottom
- User scrolling up disables auto-scroll
- No "new messages" banner for this iteration

## Acceptance criteria

- Thread detail page shows continuous conversation flow without visible Turn boundaries
- User messages and agent messages have clear visual distinction
- Tool calls (commands, file changes) render as inline expandable cards
- Input area is compact with Stop icon button
- Works correctly on both mobile and desktop layouts
- TypeScript compiles without errors

## Assumptions

- No virtual scrolling needed for initial implementation (conversation lengths are manageable)
- Existing `TimelineItem` collapsible behavior is reused for tool call cards (but not for Turn-level wrapping)
- Pending requests remain displayed above the message stream
- The `ThreadItem` type from protocol remains unchanged; flattening is purely a view-layer concern
