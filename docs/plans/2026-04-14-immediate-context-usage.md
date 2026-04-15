# Implementation Plan: Immediate Context Usage Display

## Module Changes

### 1. New: `apps/bridge/src/threads/rolloutTokenUsage.ts`

Core rollout file reader. Exports a single function:

```typescript
export async function extractTokenUsageFromRollout(source: {
  rolloutPath?: string | null;
  threadId?: string;
  codexHome?: string;
}): Promise<ThreadContextUsage | null>;
```

**Internal steps:**

1. Resolve rollout file:
   - **Primary**: use `thread.path` from `thread/resume`
   - **Fallback**: search `initialize.codexHome/{sessions,archived_sessions}/**/rollout-*-${threadId}.jsonl`
   - If not found, return `null`
2. Read file and extract token data:
   - Read JSONL from the tail backwards in chunks
   - Return the first line from the end where `payload.type === 'token_count'` and `payload.info !== null`
   - Map rollout field names to protocol types:

```typescript
// Rollout file (snake_case) -> Protocol (camelCase)
info.total_token_usage -> total
info.last_token_usage -> last
info.model_context_window -> modelContextWindow
  .total_tokens -> totalTokens
  .input_tokens -> inputTokens
  .cached_input_tokens -> cachedInputTokens
  .output_tokens -> outputTokens
  .reasoning_output_tokens -> reasoningOutputTokens
```

**Error handling**: All file operations wrapped in try-catch, return `null` on any failure.

### 2. Modify: `apps/bridge/src/threadService.ts`

In `resumeThread()` method, after existing logic, add rollout extraction:

```typescript
async resumeThread(threadId: string): Promise<void> {
  const result = await this.appServerClient.resumeThread(threadId);
  this.#cache.setThreadCwd(threadId, result.thread.cwd);
  const settings = toThreadSettings(result);
  this.#cache.setThreadSettings(threadId, settings);
  this.#emitBridgeEvent({
    type: 'threadSettingsUpdated',
    threadId,
    settings,
  });

  // NEW: Extract token usage from rollout file returned by app-server
  const previousContextUsage = this.#cache.getContextUsage(threadId);
  const contextUsage = await extractTokenUsageFromRollout({
    rolloutPath: result.thread.path,
    threadId,
    codexHome: this.codexHome,
  });
  if (
    contextUsage &&
    this.#cache.getContextUsage(threadId) === previousContextUsage
  ) {
    this.#cache.setContextUsage(threadId, contextUsage);
    this.#emitBridgeEvent({
      type: 'threadContextUsageUpdated',
      threadId,
      contextUsage,
    });
  }
}
```

Key design decision: Only emit rollout-derived data if no newer live notification has replaced the cache during extraction. Clear cached context usage on unsubscribe/closed so the next resume cannot reuse stale data.

## Task Breakdown

1. Create `rolloutTokenUsage.ts` with path-first resolution and codexHome fallback
2. Add reverse JSONL scanning and token_count extraction logic
3. Add snake_case → camelCase mapping
4. Integrate into `threadService.ts` `resumeThread()` and clear stale cache on unsubscribe/closed
5. Add focused tests
6. Build + type check + test

## Verification

- `pnpm build` passes
- `pnpm --filter @my-codex-app/bridge test` passes
- Manual test: open a thread with history → context data shows immediately
