# Immediate Context Usage Display

## Background

When entering a thread detail page, context window data shows "unavailable" until Bridge receives a `thread/tokenUsage/updated` notification from the app-server. The app-server's `thread/resume` response does not include token data, and turn items have `TokenCountEvent` filtered out upstream.

Native Codex resolves this by reading rollout files directly via `last_token_info_from_rollout()`. We replicate this approach in TypeScript within the Bridge.

## Goal

Extract token usage from Codex rollout JSONL files during `resumeThread()`, enabling immediate context data display for any thread with prior history.

## Approach

1. New module reads rollout files using the `thread.path` returned by `thread/resume`.
2. If `thread.path` is absent, fallback uses app-server `initialize.codexHome` to search `sessions/` and `archived_sessions/`.
3. Scans JSONL backwards for the last `token_count` event with non-null `info`.
4. Maps rollout snake_case fields to `ThreadContextUsage` protocol type.
5. Injected into `resumeThread()`: refresh cache result, but never overwrite a newer live notification.

## Scope

- New: `apps/bridge/src/threads/rolloutTokenUsage.ts`
- Modified: `apps/bridge/src/threadService.ts` (`resumeThread` method)
- Not touched: client code, app-server protocol

## Edge Cases

- New thread (no rollout file): returns null, no behavior change
- `token_count` with null `info`: skip, continue scanning
- `thread.path` absent: fallback to `codexHome` tree search
- File read error: silent fail, return null
- Custom Codex home: use app-server `initialize.codexHome`, not bridge process env
- Reconnect after unsubscribe: clear stale cached context usage so resume rehydrates from rollout

## Acceptance Criteria

- Opening a thread with prior turns shows context data immediately
- New threads still show "unavailable"
- Live `thread/tokenUsage/updated` notifications still update correctly
- Resume must not re-emit stale rollout data over a newer live notification
- No measurable performance regression on resume
