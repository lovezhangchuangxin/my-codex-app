import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { extractTokenUsageFromRollout } from '../src/threads/rolloutTokenUsage';

test('extractTokenUsageFromRollout reads the last valid token_count from an explicit rollout path', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'bridge-rollout-'));
  const rolloutPath = path.join(tempRoot, 'rollout.jsonl');

  await writeFile(
    rolloutPath,
    [
      JSON.stringify({ type: 'event_msg', payload: { type: 'other_event' } }),
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: buildTokenInfo(111),
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: null,
        },
      }),
      '',
    ].join('\n'),
    'utf-8',
  );

  const usage = await extractTokenUsageFromRollout({
    rolloutPath,
  });

  assert.deepEqual(usage, {
    total: {
      totalTokens: 111,
      inputTokens: 112,
      cachedInputTokens: 113,
      outputTokens: 114,
      reasoningOutputTokens: 115,
    },
    last: {
      totalTokens: 116,
      inputTokens: 117,
      cachedInputTokens: 118,
      outputTokens: 119,
      reasoningOutputTokens: 120,
    },
    modelContextWindow: 211,
  });
});

test('extractTokenUsageFromRollout falls back to codexHome search when rollout path is absent', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'bridge-rollout-home-'));
  const threadId = '67e55044-10b1-426f-9247-bb680e5fe0c8';
  const rolloutDir = path.join(
    tempRoot,
    'archived_sessions',
    '2026',
    '04',
    '14',
  );
  const rolloutPath = path.join(
    rolloutDir,
    `rollout-2026-04-14T12-00-00-${threadId}.jsonl`,
  );

  await mkdir(rolloutDir, { recursive: true });
  await writeFile(
    rolloutPath,
    `${JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: buildTokenInfo(301),
      },
    })}\n`,
    'utf-8',
  );

  const usage = await extractTokenUsageFromRollout({
    threadId,
    codexHome: tempRoot,
  });

  assert.equal(usage?.total.totalTokens, 301);
  assert.equal(usage?.modelContextWindow, 401);
});

function buildTokenInfo(seed: number) {
  return {
    total_token_usage: {
      total_tokens: seed,
      input_tokens: seed + 1,
      cached_input_tokens: seed + 2,
      output_tokens: seed + 3,
      reasoning_output_tokens: seed + 4,
    },
    last_token_usage: {
      total_tokens: seed + 5,
      input_tokens: seed + 6,
      cached_input_tokens: seed + 7,
      output_tokens: seed + 8,
      reasoning_output_tokens: seed + 9,
    },
    model_context_window: seed + 100,
  };
}
