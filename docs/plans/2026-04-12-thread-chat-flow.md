# Thread Detail Chat Flow — Implementation Plan

## Task breakdown

### Task 1: Add `flattenTurnItems` utility

**File**: `apps/client/src/features/threads/lib/thread-utils.ts`

Add a function that takes an array of Turns and returns a flat array of items with turn metadata attached:

```ts
type FlatThreadItem = ThreadItem & {
  turnId: string;
  turnIndex: number;
  isFirstInTurn: boolean;
};

function flattenTurnItems(turns: Turn[]): FlatThreadItem[];
```

- Reverse turns (newest-first → oldest-first for chronological display)
- Attach `turnId`, `turnIndex`, `isFirstInTurn` to each item
- This preserves the ability to detect turn boundaries for subtle grouping if needed later, without showing explicit Turn headers

### Task 2: Rewrite message stream components

**File**: `apps/client/src/features/threads/components/thread-detail-panel.tsx`

**Remove**:

- The `Accordion` / `AccordionItem` / `AccordionTrigger` / `AccordionContent` structure for turns
- "Turn activity" / "Timeline" section headings
- The Turns/Requests/Updated statistics bar
- The "No turns yet" empty state text (replace with conversation-appropriate empty state)

**Add**:

- `MessageStream` component: iterates over `flattenTurnItems(thread.turns)` and renders each item
- `UserMessageBubble` component: right-aligned bubble for user messages
- `AgentMessageBlock` component: left-aligned block for agent messages
- `ThinkingBlock` component: collapsible reasoning block
- `CommandCard` component: terminal-style card for command execution (collapsible output)
- `FileChangeCard` component: file change card (collapsible diff)
- `ToolLabel` component: small inline label for webSearch/imageView

**Keep unchanged**:

- `PendingRequestList` section (above message stream)
- Connection banner
- Error display
- Loading skeleton
- Mobile thread switcher
- `EmptyDetailState` component (reuse for no-conversation state)
- All rich rendering helpers: `RichMarkdown`, `RichCodeBlock`, `RichTerminalOutput`, `PlainTextFallback`, `PlainCodeFallback`
- All summarization helpers
- `StatusBadge` component

### Task 3: Simplify thread detail composer

**File**: `apps/client/src/features/threads/components/thread-detail-composer.tsx`

- Remove "Send message" text button, replace with send icon button
- Replace "Interrupt turn" text button with Stop square icon button (compact)
- Remove "Live thread" label
- Remove character count
- Keep textarea and form logic unchanged

### Task 4: Auto-scroll hook

**File**: `apps/client/src/features/threads/lib/use-auto-scroll.ts` (new)

Simple hook:

- Takes a scroll container ref
- Tracks whether user is near bottom (within ~100px threshold)
- On new content: if near bottom, scroll to bottom; otherwise do nothing
- Uses `MutationObserver` or `useEffect` on content length changes

### Task 5: Integrate and verify

- Wire `useAutoScroll` into `MessageStream`
- Ensure `ReadyThreadDetail` uses the new message stream
- Remove inline composer from `ReadyThreadDetail`, use the simplified thread detail composer
- Type check: `pnpm build`
- Manual visual verification

## File change summary

| File                                                                     | Action                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `apps/client/src/features/threads/lib/thread-utils.ts`                   | Add `flattenTurnItems` and `FlatThreadItem` type                |
| `apps/client/src/features/threads/lib/use-auto-scroll.ts`                | New — auto-scroll hook                                          |
| `apps/client/src/features/threads/components/thread-detail-panel.tsx`    | Major rewrite — new message stream components, remove Accordion |
| `apps/client/src/features/threads/components/thread-detail-composer.tsx` | Simplify — icon buttons, remove labels                          |

## Execution order

1 → 2 → 3 → 4 → 5 (sequential, each builds on previous)

## Verification

- `pnpm build` passes with zero type errors
- Visual check: thread detail shows continuous flow
- Mobile layout works correctly
- Pending requests still render above message stream
