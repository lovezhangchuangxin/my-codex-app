import type { ThreadContextUsage } from '@my-codex-app/protocol';

import { open, readdir } from 'node:fs/promises';
import * as path from 'node:path';

const ACTIVE_SESSIONS_SUBDIR = 'sessions';
const ARCHIVED_SESSIONS_SUBDIR = 'archived_sessions';
const READ_CHUNK_SIZE = 64 * 1024;

export interface RolloutTokenUsageSource {
  rolloutPath?: string | null | undefined;
  threadId?: string | undefined;
  codexHome?: string | undefined;
}

interface TokenUsageInfo {
  total_token_usage: TokenUsageFields;
  last_token_usage: TokenUsageFields;
  model_context_window: number | null;
}

interface TokenUsageFields {
  total_tokens: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
}

/**
 * Extract the last known token usage from a Codex rollout JSONL file.
 * Returns `null` when no rollout file exists or no token data is found.
 */
export async function extractTokenUsageFromRollout(
  source: RolloutTokenUsageSource,
): Promise<ThreadContextUsage | null> {
  const rolloutPath = await resolveRolloutPath(source);
  if (!rolloutPath) {
    return null;
  }

  const info = await findLastTokenInfo(rolloutPath);
  if (!info) {
    return null;
  }

  return mapToThreadContextUsage(info);
}

async function resolveRolloutPath(
  source: RolloutTokenUsageSource,
): Promise<string | null> {
  if (typeof source.rolloutPath === 'string' && source.rolloutPath.length > 0) {
    return source.rolloutPath;
  }

  if (!source.threadId || !source.codexHome) {
    return null;
  }

  return findRolloutPath(source.codexHome, source.threadId);
}

export async function findRolloutPath(
  codexHome: string,
  threadId: string,
): Promise<string | null> {
  const fileSuffix = `-${threadId}.jsonl`;

  for (const subdir of [ACTIVE_SESSIONS_SUBDIR, ARCHIVED_SESSIONS_SUBDIR]) {
    const root = path.join(codexHome, subdir);
    const match = await findRolloutPathInTree(root, fileSuffix);
    if (match) {
      return match;
    }
  }

  return null;
}

async function findRolloutPathInTree(
  root: string,
  fileSuffix: string,
): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const entryPath = path.join(root, entry.name);

    if (entry.isFile()) {
      if (
        entry.name.startsWith('rollout-') &&
        entry.name.endsWith(fileSuffix)
      ) {
        return entryPath;
      }
      continue;
    }

    if (entry.isDirectory()) {
      const nestedMatch = await findRolloutPathInTree(entryPath, fileSuffix);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

/**
 * Walk the rollout file backwards so we can stop at the first matching
 * `token_count` event near the tail instead of scanning the entire file.
 */
async function findLastTokenInfo(
  filePath: string,
): Promise<TokenUsageInfo | null> {
  let fileHandle;
  try {
    fileHandle = await open(filePath, 'r');
    const { size } = await fileHandle.stat();
    let position = size;
    let trailingBytes = Buffer.alloc(0);

    while (position > 0) {
      const chunkSize = Math.min(READ_CHUNK_SIZE, position);
      position -= chunkSize;

      const chunk = Buffer.allocUnsafe(chunkSize);
      const { bytesRead } = await fileHandle.read(
        chunk,
        0,
        chunkSize,
        position,
      );
      let combined = chunk.subarray(0, bytesRead);
      if (trailingBytes.length > 0) {
        combined = Buffer.concat([combined, trailingBytes]);
      }

      let lineEnd = combined.length;
      for (let cursor = combined.length - 1; cursor >= 0; cursor -= 1) {
        if (combined[cursor] !== 0x0a) {
          continue;
        }

        const line = combined.subarray(cursor + 1, lineEnd);
        const info = parseTokenInfoLine(line);
        if (info) {
          return info;
        }
        lineEnd = cursor;
      }

      trailingBytes = combined.subarray(0, lineEnd);
    }

    return parseTokenInfoLine(trailingBytes);
  } catch {
    return null;
  } finally {
    await fileHandle?.close().catch(() => {});
  }
}

function parseTokenInfoLine(line: Uint8Array): TokenUsageInfo | null {
  const text = Buffer.from(line).toString('utf-8').trim();
  if (!text) {
    return null;
  }

  try {
    const record = JSON.parse(text);
    if (
      record?.type === 'event_msg' &&
      record?.payload?.type === 'token_count' &&
      isValidTokenInfo(record.payload.info)
    ) {
      return record.payload.info;
    }
  } catch {
    return null;
  }

  return null;
}

function isValidTokenInfo(value: unknown): value is TokenUsageInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const info = value as Record<string, unknown>;
  return (
    isValidBreakdown(info.total_token_usage) &&
    isValidBreakdown(info.last_token_usage) &&
    (info.model_context_window === null ||
      typeof info.model_context_window === 'number')
  );
}

function isValidBreakdown(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const breakdown = value as Record<string, unknown>;
  return (
    typeof breakdown.total_tokens === 'number' &&
    typeof breakdown.input_tokens === 'number' &&
    typeof breakdown.cached_input_tokens === 'number' &&
    typeof breakdown.output_tokens === 'number' &&
    typeof breakdown.reasoning_output_tokens === 'number'
  );
}

function mapToThreadContextUsage(info: TokenUsageInfo): ThreadContextUsage {
  return {
    total: mapBreakdown(info.total_token_usage),
    last: mapBreakdown(info.last_token_usage),
    modelContextWindow: info.model_context_window,
  };
}

function mapBreakdown(
  breakdown: TokenUsageFields,
): ThreadContextUsage['total'] {
  return {
    totalTokens: breakdown.total_tokens,
    inputTokens: breakdown.input_tokens,
    cachedInputTokens: breakdown.cached_input_tokens,
    outputTokens: breakdown.output_tokens,
    reasoningOutputTokens: breakdown.reasoning_output_tokens,
  };
}
