# Turn Progress Indicator — Implementation Plan

## Relationship To Spec

Implements `docs/specs/2026-04-17-turn-progress-indicator.md`.

## Implementation Strategy

This is a client-only change (no protocol/bridge/SDK modifications). The work is tightly coupled — the new component depends on data threading and utility functions that all need to exist together. **Recommended approach: main agent execution.**

## Task Breakdown

### Task 1: Add formatting utilities and phase type

**File:** `apps/client/src/features/threads/lib/thread-utils.ts`

Add three exports:

```ts
export type TurnPhase =
  | 'thinking'
  | 'generating'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'interrupted';

export function formatTokensCompact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const v = value / 1000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  const v = value / 1_000_000;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
}

export function formatDurationCompact(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
```

These follow the formatting rules in the spec. `formatTokensCompact` is separate from the existing `formatTokenCount` (which uses `Intl.NumberFormat` for the ContextUsageButton).

### Task 2: Add `turnPhase` to `FlatThreadItem` and compute in `flattenTurnItems`

**File:** `apps/client/src/features/threads/lib/thread-utils.ts`

Add `turnPhase: TurnPhase` to the `FlatThreadItem` type:

```ts
export type FlatThreadItem = ThreadItem & {
  turnId: string;
  turnIndex: number;
  turnStatus: TurnDetail['status'];
  turnStartedAt?: number;
  turnCompletedAt?: number;
  turnDurationMs?: number;
  turnPhase: TurnPhase; // NEW
  isReasoningLive: boolean;
  isFirstInTurn: boolean;
  turnError?: TurnError;
};
```

Add derivation function:

```ts
export function deriveTurnPhase(
  turnStatus: TurnDetail['status'],
  lastItem: ThreadItem | undefined,
  isLastItemReasoningLive: boolean,
): TurnPhase {
  switch (turnStatus) {
    case 'failed':
      return 'failed';
    case 'interrupted':
      return 'interrupted';
    case 'completed':
      return 'completed';
    // inProgress — derive from last item
  }

  if (!lastItem) return 'thinking';

  switch (lastItem.type) {
    case 'reasoning':
      return isLastItemReasoningLive ? 'thinking' : 'generating';
    case 'agentMessage':
      return 'generating';
    case 'commandExecution':
      return lastItem.status === 'inProgress' ? 'executing' : 'generating';
    default:
      return 'thinking';
  }
}
```

In `flattenTurnItems`, compute phase once per turn after building `visibleTurnItems`, then attach to each `FlatThreadItem`:

```ts
// After building visibleTurnItems array for a turn:
const lastVisible = visibleTurnItems.at(-1);
const turnPhase = deriveTurnPhase(
  turn.status,
  lastVisible?.base,
  lastVisible?.isReasoningLive ?? false,
);

// Then in each items.push({...}), add:
turnPhase,
```

**Why computed here, not in component:** `ThinkingBlock` only has access to its own item — it cannot see sibling items to determine "what is the last item in this turn?" Computing phase during flattening is the natural place since `flattenTurnItems` iterates all items per turn.

### Task 3: Thread `contextUsage` into message stream

**File:** `apps/client/src/features/threads/components/thread-detail-panel.tsx`

Pass `thread.contextUsage` down to `ThreadMessageStream`:

```diff
  <ThreadMessageStream
    flatItems={flatItems}
+   contextUsage={thread.contextUsage}
    onFilePathClick={handleFilePathClick}
    ...
  />
```

Note: There are two `ThreadMessageStream` call sites in this file (desktop and mobile layouts). Both need the new prop.

**File:** `apps/client/src/features/threads/components/thread-detail-messages.tsx`

1. Add `contextUsage` to `ThreadMessageStream` props type.
2. Pass `contextUsage` to `ThinkingBlock` / `FlatItemRenderer`.

### Task 4: Build `TurnProgressIndicator` and refactor `ThinkingBlock`

**File:** `apps/client/src/features/threads/components/thread-detail-messages.tsx`

This is the main task. The `ThinkingBlock` component is refactored to:

1. Read `turnPhase` from `item.turnPhase` (computed in Task 2).
2. Render `TurnProgressIndicator` as the header row (replacing the current button with Brain + "Thinking..." text).
3. Keep the existing collapsible content body unchanged.

**`TurnProgressIndicator` props:**

```ts
interface TurnProgressIndicatorProps {
  phase: TurnPhase;
  liveElapsedSeconds: number; // computed inside ThinkingBlock
  turnDurationMs?: number; // from item.turnDurationMs
  contextUsage: ThreadContextUsage | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  hasContent: boolean; // summary.length > 0 || content.length > 0
}
```

**Rendering by phase:**

| Phase       | Icon                           | Label         | Timer source   | Tokens     | Badge                     |
| ----------- | ------------------------------ | ------------- | -------------- | ---------- | ------------------------- |
| thinking    | Brain (animate-pulse)          | "Thinking…"   | live elapsed   | ↓ in ↑ out | "reasoning" (active tone) |
| generating  | Sparkles (animate-pulse)       | "Generating…" | live elapsed   | ↓ in ↑ out | "writing" (active tone)   |
| executing   | SquareTerminal (animate-pulse) | "Executing…"  | live elapsed   | ↓ in ↑ out | "executing" (active tone) |
| completed   | Check (static)                 | "Completed"   | turnDurationMs | ↓ in ↑ out | —                         |
| failed      | TriangleAlert (static)         | "Failed"      | turnDurationMs | —          | —                         |
| interrupted | Square (static)                | "Interrupted" | turnDurationMs | —          | —                         |

**StatusBadge tone mapping:** Reuse existing `StatusBadgeTone` values:

- Active phases (thinking/generating/executing) → `'active'`
- Failed → `'error'`
- Completed/interrupted → no badge

**Layout structure:**

```
<button onClick={toggleExpand} class="flex items-center gap-1.5 text-[0.8rem] text-muted-foreground ...">
  <Icon class={cn("size-3.5", isActive && "animate-pulse")} />
  <span>{label}</span>
  <span class="ml-1 tabular-nums">{timer}</span>
  <span class="hidden sm:inline"> · ↓ {input}  ↑ {output}</span>
  {badge && <StatusBadge label={badge} tone="active" />}
  {hasContent && <ChevronDown class={...} />}
</button>
```

**Token data source:**

```ts
const turnTokens = contextUsage?.last ?? null;
const inputStr = turnTokens
  ? formatTokensCompact(turnTokens.inputTokens)
  : null;
const outputStr = turnTokens
  ? formatTokensCompact(turnTokens.outputTokens)
  : null;
```

**Timer logic (lives in ThinkingBlock, passed to TurnProgressIndicator):**

- Active phases: `derivedLiveElapsedSeconds` (existing logic — tracks start time per reasoning item)
- Completed/failed/interrupted: `Math.round(item.turnDurationMs / 1000)` → `formatDurationCompact(seconds)`

**Imports needed:** `Check`, `Sparkles`, `Square` from lucide-react (in addition to existing `Brain`, `ChevronDown`, `TriangleAlert`).

### Task 5: Add i18n keys

**Files:**

- `apps/client/src/lib/i18n/messages/en.ts`
- `apps/client/src/lib/i18n/messages/zh-CN.ts`

Add keys:

```ts
'detail.progress.thinking': 'Thinking…',
'detail.progress.generating': 'Generating…',
'detail.progress.executing': 'Executing…',
'detail.progress.completed': 'Completed',
'detail.progress.failed': 'Failed',
'detail.progress.interrupted': 'Interrupted',
'detail.progress.phase.reasoning': 'reasoning',
'detail.progress.phase.writing': 'writing',
'detail.progress.phase.executing': 'executing',
```

Chinese:

```ts
'detail.progress.thinking': '思考中…',
'detail.progress.generating': '生成中…',
'detail.progress.executing': '执行中…',
'detail.progress.completed': '已完成',
'detail.progress.failed': '已失败',
'detail.progress.interrupted': '已中断',
'detail.progress.phase.reasoning': '推理',
'detail.progress.phase.writing': '输出',
'detail.progress.phase.executing': '执行',
```

### Task 6: Remove old i18n keys (if replaced)

The existing `detail.reasoning.thinking` and `detail.reasoning.completed` keys may still be used elsewhere or may be fully replaced. Check usages before removing. If they are only used in `ThinkingBlock`, they can be replaced with the new `detail.progress.*` keys.

## File Change Summary

| File                                                                     | Change                                                                                                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client/src/features/threads/lib/thread-utils.ts`                   | Add `TurnPhase` type, `formatTokensCompact`, `formatDurationCompact`, `deriveTurnPhase`; add `turnPhase` to `FlatThreadItem`; compute phase in `flattenTurnItems` |
| `apps/client/src/features/threads/components/thread-detail-messages.tsx` | New `TurnProgressIndicator` component; refactor `ThinkingBlock` to use it; accept `contextUsage` prop                                                             |
| `apps/client/src/features/threads/components/thread-detail-panel.tsx`    | Pass `contextUsage` to `ThreadMessageStream` (both call sites)                                                                                                    |
| `apps/client/src/lib/i18n/messages/en.ts`                                | Add 9 i18n keys                                                                                                                                                   |
| `apps/client/src/lib/i18n/messages/zh-CN.ts`                             | Add 9 i18n keys                                                                                                                                                   |

No changes to: `packages/protocol`, `packages/sdk`, `apps/bridge`.

## Verification Plan

1. **Type check:** `pnpm tsc --noEmit` from project root
2. **Format:** `pnpm fmt`
3. **Manual verification:**
   - Open a thread, send a message
   - Verify "Thinking…" phase shows with timer + token counts + "reasoning" badge
   - Verify transition to "Generating…" when agent starts writing text
   - Verify "Executing…" when a command runs
   - Verify "Completed" state with final duration and total tokens after turn ends
   - Verify expand/collapse of reasoning content still works
   - Verify token counts appear/disappear based on data availability
   - Verify mobile layout (token counts hidden on narrow viewports)
4. **Edge cases:**
   - Turn with no reasoning block → no progress indicator shown (current scope)
   - Turn with failed status → shows "Failed" with error icon
   - Turn interrupted by user → shows "Interrupted" with stop icon
   - Null contextUsage → token counts hidden, rest of indicator works
   - Reconnect during active turn → indicator recovers from current state
5. **Regression:**
   - ContextUsageButton in composer still shows token counts correctly
   - Existing `formatTokenCount` not affected

## Rollback

All changes are confined to client rendering code. Reverting the 5 files restores the original ThinkingBlock behavior.
