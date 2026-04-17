# Turn Progress Indicator

## Relationship To Existing Docs

This spec extends and stays aligned with:

- `docs/specs/2026-04-16-approval-and-reasoning-parity.md` (reasoning streaming, timing semantics)
- `docs/specs/2026-04-14-immediate-context-usage.md` (token usage data flow)
- `docs/specs/2026-04-12-thread-chat-flow.md` (thread detail layout)

## Background

The current thread detail page shows agent activity with a minimal ThinkingBlock: a Brain icon, "Thinking..." label, and a live elapsed seconds counter. This provides insufficient feedback about what the agent is doing during long-running turns.

The upstream Codex TUI displays a rich status line during turns that includes:

- Phase-aware status (thinking, generating, executing)
- Elapsed time with compact formatting (e.g. "1m 15s")
- Token counts (input/output) with compact formatting (e.g. "↓ 4.2k", "↑ 891")
- Animated status indicator

All required data already flows through the existing protocol (`threadContextUsageUpdated`, turn timing, item streaming deltas). This spec proposes surfacing that data in a unified turn-level progress indicator.

## Goals

- Replace the minimal "Thinking... Ns" display with a rich, phase-aware progress indicator.
- Show real-time token usage (input/output) during active turns.
- Provide clear phase indication: thinking, generating, executing, completed, failed, or interrupted.
- Format timing and token counts in compact, scannable form.
- Maintain compatibility with existing reasoning block expand/collapse behavior.

## Non-Goals

- Full TUI parity (spinner animation styles, terminal title integration).
- New protocol events or bridge changes (all data already flows).
- Per-item token breakdown display.
- Cost estimation or pricing display.
- Changes to the composer area or ContextUsageButton (which remains as-is).
- Showing progress indicator for turns without reasoning items (future enhancement).

## Scope

### In scope

- New `TurnProgressIndicator` component replacing ThinkingBlock header row.
- Phase detection logic computed in `flattenTurnItems` and carried on `FlatThreadItem`.
- Token count formatting and display within the progress indicator.
- Time formatting with compact notation (>= 60s → "1m 15s").
- i18n keys for all new labels (en.ts + zh-CN.ts).
- Responsive behavior (full display on desktop, token counts hidden on narrow screens if needed).

### Out of scope

- Protocol/bridge/SDK changes.
- Changes to command execution cards or file change cards.
- Changes to approval flow UI.
- New animation system (reuse existing CSS transitions).
- Progress indicator for turns that have no reasoning items (currently ThinkingBlock only renders for `item.type === 'reasoning'`; extending to all turns would require changes to `FlatItemRenderer`).

## User Requirements

### Phase awareness

During an active turn, users must be able to tell at a glance whether the agent is:

1. **Thinking** (reasoning/planning) — the most common "waiting" state
2. **Generating** (writing response text) — content is being produced
3. **Executing** (running commands) — tool use is happening
4. **Completed** — turn finished successfully
5. **Failed** — turn ended with error
6. **Interrupted** — turn was stopped by user

The indicator must auto-detect the current phase from turn item state and transition smoothly.

### Token visibility

Users should see real-time token counts during active turns:

- Input tokens (cumulative for the turn) with "↓" prefix
- Output tokens (cumulative for the turn) with "↑" prefix
- Values formatted compactly (e.g. 1.2k, 15.3k, 1.1M)

Token data comes from the existing `threadContextUsageUpdated` event's `last` field (per-turn breakdown).

A new `formatTokensCompact` function is introduced for the progress indicator. The existing `formatTokenCount` (in `thread-detail-utils.ts`) uses `Intl.NumberFormat` (e.g. "4,200") and is used by the ContextUsageButton. These two formatters serve different UX contexts and coexist independently.

### Timing display

- During active turns: live elapsed timer, updating every second
- After completion: final duration from canonical `turn.durationMs`
- Compact formatting: "12s" under 60s, "1m 15s" at 60s+
- Timer values must be visually distinct from canonical timing to avoid implying the live counter is persisted upstream (per reasoning parity spec)

### Completed and error states

After a turn ends, the indicator shows a compact summary line:

- **Completed**: checkmark icon, final duration, total tokens
- **Failed**: error icon (TriangleAlert), final duration, error indication
- **Interrupted**: stop icon (Square), final duration

### Reasoning content

The existing expandable reasoning content area (summary + raw reasoning text) must continue to work. The progress indicator replaces only the header/button row of ThinkingBlock. The indicator itself serves as the expand/collapse trigger (same as the current button behavior).

## Phase Detection Logic

Phase is computed during `flattenTurnItems` and stored as `turnPhase` on each `FlatThreadItem`. This is necessary because the component only has access to its own item — it cannot look at sibling items to determine "what is the last item in this turn?"

Derivation from the turn's last visible item:

| Condition                                                                            | Phase         |
| ------------------------------------------------------------------------------------ | ------------- |
| Turn `status === 'failed'`                                                           | `failed`      |
| Turn `status === 'interrupted'`                                                      | `interrupted` |
| Turn `status === 'completed'`                                                        | `completed`   |
| Turn is `inProgress`, last item is `reasoning` with `isReasoningLive`                | `thinking`    |
| Turn is `inProgress`, last item is `agentMessage`                                    | `generating`  |
| Turn is `inProgress`, last item is `commandExecution` with `status === 'inProgress'` | `executing`   |
| Turn is `inProgress` but no items or no match                                        | `thinking`    |

The phase is a derived UI value, not persisted. It is computed once in `flattenTurnItems` per item batch update.

## Data Flow

```
threadContextUsageUpdated event
  → ThreadRuntime stores contextUsage on thread state (existing)
  → ThreadDetailPanel passes contextUsage down to ThreadMessageStream (new prop)
  → ThinkingBlock receives contextUsage and reads usage.last.inputTokens / outputTokens
```

No new events or state management is required. The `contextUsage` is already stored per-thread; it just needs to be threaded from `ThreadDetailPanel` → `ThreadMessageStream` → `ThinkingBlock`.

## Token Formatting Rules

New function `formatTokensCompact` (separate from existing `formatTokenCount`):

- `< 1000`: raw number (e.g. "891")
- `1000–999999`: divide by 1000, one decimal, strip trailing `.0` (e.g. "1.2k", "15.3k")
- `>= 1 000 000`: divide by 1 000 000, one decimal, strip trailing `.0` (e.g. "1.1M")

## Time Formatting Rules

New function `formatDurationCompact`:

- `< 60s`: "{n}s" (e.g. "12s")
- `>= 60s`: "{m}m {pad s}s" (e.g. "1m 15s", "12m 03s")

## Responsive Behavior

- Desktop (lg+): full indicator with icon + label + timer + tokens + phase badge
- Mobile: same indicator, but token counts use `hidden sm:inline` so they gracefully hide on narrow viewports

## Accessibility

- Phase indicator uses icon + text, not color alone.
- Timer values use `tabular-nums` for stable width.
- ARIA label on the progress row describing current state.

## i18n Keys

All keys to be added to both `en.ts` and `zh-CN.ts`:

| Key                               | English     | Chinese |
| --------------------------------- | ----------- | ------- |
| `detail.progress.thinking`        | Thinking…   | 思考中… |
| `detail.progress.generating`      | Generating… | 生成中… |
| `detail.progress.executing`       | Executing…  | 执行中… |
| `detail.progress.completed`       | Completed   | 已完成  |
| `detail.progress.failed`          | Failed      | 已失败  |
| `detail.progress.interrupted`     | Interrupted | 已中断  |
| `detail.progress.phase.reasoning` | reasoning   | 推理    |
| `detail.progress.phase.writing`   | writing     | 输出    |
| `detail.progress.phase.executing` | executing   | 执行    |

## Risks

- **Flicker on phase transitions**: if the "last item" rapidly alternates (e.g. reasoning completes, then agentMessage starts), the phase could flicker. Mitigation: add a brief debounce or ensure the transition is visually smooth via CSS transition.
- **Stale token data on reconnect**: if `threadContextUsageUpdated` was missed during disconnect, the indicator may show stale counts until the next event. This is acceptable; the existing ContextUsageButton has the same constraint. Token counts are simply hidden when null.
- **ContextUsage not yet available**: for a brand-new turn, `threadContextUsageUpdated` may not have fired yet. The indicator must handle `null` usage gracefully (hide token counts, show rest of indicator).
- **Scope limitation**: the indicator only appears for turns that have reasoning items (matching current ThinkingBlock rendering scope). Turns without reasoning items will not show a progress indicator in this iteration.

## Acceptance Criteria

- Active turn with reasoning shows a progress indicator with phase, elapsed time, and token counts.
- Phase auto-detects between thinking/generating/executing based on turn's last item type.
- Completed turn shows a compact summary with final duration and total tokens.
- Failed turn shows error icon and error indication.
- Interrupted turn shows stop icon.
- Token counts use compact formatting (1.2k, 15.3k, 1.1M) via new `formatTokensCompact` function.
- Time formatting uses compact notation (12s, 1m 15s) via new `formatDurationCompact` function.
- Existing `formatTokenCount` and ContextUsageButton remain unchanged.
- Expandable reasoning content continues to work as before.
- Phase is computed in `flattenTurnItems` and carried as `turnPhase` on `FlatThreadItem`.
- `contextUsage` is threaded from panel → message stream → ThinkingBlock without new state.
- All new UI text has i18n keys in both en.ts and zh-CN.ts.
- Type correctness preserved (tsc --noEmit passes).
