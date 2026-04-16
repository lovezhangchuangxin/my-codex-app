import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import type { BridgeEvent } from '@my-codex-app/protocol';

import { ThreadService } from '../src/threadService';

test('ThreadService refreshes context usage after unsubscribe instead of reusing stale cache', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'thread-service-'));
  const rolloutPath = path.join(tempRoot, 'rollout.jsonl');
  const threadId = '67e55044-10b1-426f-9247-bb680e5fe0c8';

  await writeRollout(rolloutPath, 10);

  const client = new FakeAppServerClient(rolloutPath);
  const service = new ThreadService(client as never, tempRoot);
  const events: BridgeEvent[] = [];
  const unsubscribeEvents = service.onBridgeEvent((event) => {
    events.push(event);
  });

  await service.resumeThread(threadId);
  assert.equal(
    lastContextUsageEvent(events)?.contextUsage.total.totalTokens,
    10,
  );

  await service.unsubscribeThread(threadId);
  await writeRollout(rolloutPath, 20);
  await service.resumeThread(threadId);

  assert.equal(
    lastContextUsageEvent(events)?.contextUsage.total.totalTokens,
    20,
  );
  assert.equal(client.unsubscribeCalls, 1);

  unsubscribeEvents();
});

test('ThreadService does not overwrite live context usage that arrives before rollout seeding', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'thread-service-live-'));
  const rolloutPath = path.join(tempRoot, 'rollout.jsonl');
  const threadId = '67e55044-10b1-426f-9247-bb680e5fe0c8';

  await writeRollout(rolloutPath, 10);

  const client = new FakeAppServerClient(
    rolloutPath,
    buildAppServerTokenUsage(90),
  );
  const service = new ThreadService(client as never, tempRoot);
  const events: BridgeEvent[] = [];
  const unsubscribeEvents = service.onBridgeEvent((event) => {
    events.push(event);
  });

  await service.resumeThread(threadId);

  const contextEvents = events.filter(
    (
      event,
    ): event is Extract<BridgeEvent, { type: 'threadContextUsageUpdated' }> =>
      event.type === 'threadContextUsageUpdated',
  );
  assert.equal(contextEvents.length, 1);
  assert.equal(contextEvents[0]?.contextUsage.total.totalTokens, 90);

  unsubscribeEvents();
});

test('ThreadService canUnloadThread blocks active threads', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'thread-service-unload-'));
  const rolloutPath = path.join(tempRoot, 'rollout.jsonl');
  const threadId = '67e55044-10b1-426f-9247-bb680e5fe0c8';

  const activeClient = new FakeAppServerClient(rolloutPath, null, 'active');
  const activeService = new ThreadService(activeClient as never, tempRoot);
  assert.equal(await activeService.canUnloadThread(threadId), false);

  const idleClient = new FakeAppServerClient(rolloutPath, null, 'idle');
  const idleService = new ThreadService(idleClient as never, tempRoot);
  assert.equal(await idleService.canUnloadThread(threadId), true);
});

test('ThreadService canUnloadThread allows missing thread summaries', async () => {
  const tempRoot = await mkdtemp(
    path.join(tmpdir(), 'thread-service-unload-missing-'),
  );
  const rolloutPath = path.join(tempRoot, 'rollout.jsonl');
  const threadId = '67e55044-10b1-426f-9247-bb680e5fe0c8';

  const client = new FakeAppServerClient(rolloutPath);
  client.readSummaryError = new Error('thread not found');

  const service = new ThreadService(client as never, tempRoot);
  assert.equal(await service.canUnloadThread(threadId), true);
});

class FakeAppServerClient extends EventEmitter {
  unsubscribeCalls = 0;
  readSummaryError: Error | null = null;

  constructor(
    private readonly rolloutPath: string,
    private readonly resumeTokenUsage: ReturnType<
      typeof buildAppServerTokenUsage
    > | null = null,
    private readonly summaryStatus: 'idle' | 'active' = 'idle',
  ) {
    super();
  }

  async resumeThread(threadId: string) {
    if (this.resumeTokenUsage) {
      this.emit('notification', {
        method: 'thread/tokenUsage/updated',
        params: {
          threadId,
          tokenUsage: this.resumeTokenUsage,
        },
      });
    }

    return {
      thread: {
        id: threadId,
        preview: 'preview',
        createdAt: 1,
        updatedAt: 2,
        path: this.rolloutPath,
        cwd: '/tmp/project',
        modelProvider: 'openai',
        status: { type: 'idle' as const },
        turns: [],
      },
      model: 'gpt-5',
      modelProvider: 'openai',
      approvalPolicy: 'never' as const,
      sandbox: { type: 'dangerFullAccess' as const },
      reasoningEffort: null,
    };
  }

  async unsubscribeThread() {
    this.unsubscribeCalls += 1;
  }

  async readThreadSummary(threadId: string) {
    if (this.readSummaryError) {
      throw this.readSummaryError;
    }

    return {
      thread: {
        id: threadId,
        preview: 'preview',
        createdAt: 1,
        updatedAt: 2,
        cwd: '/tmp/project',
        modelProvider: 'openai',
        status: { type: this.summaryStatus },
      },
    };
  }
}

function lastContextUsageEvent(
  events: BridgeEvent[],
): Extract<BridgeEvent, { type: 'threadContextUsageUpdated' }> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'threadContextUsageUpdated') {
      return event;
    }
  }

  return undefined;
}

async function writeRollout(rolloutPath: string, totalTokens: number) {
  await writeFile(
    rolloutPath,
    `${JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            total_tokens: totalTokens,
            input_tokens: totalTokens + 1,
            cached_input_tokens: totalTokens + 2,
            output_tokens: totalTokens + 3,
            reasoning_output_tokens: totalTokens + 4,
          },
          last_token_usage: {
            total_tokens: totalTokens + 5,
            input_tokens: totalTokens + 6,
            cached_input_tokens: totalTokens + 7,
            output_tokens: totalTokens + 8,
            reasoning_output_tokens: totalTokens + 9,
          },
          model_context_window: totalTokens + 100,
        },
      },
    })}\n`,
    'utf-8',
  );
}

function buildAppServerTokenUsage(totalTokens: number) {
  return {
    total: {
      totalTokens,
      inputTokens: totalTokens + 1,
      cachedInputTokens: totalTokens + 2,
      outputTokens: totalTokens + 3,
      reasoningOutputTokens: totalTokens + 4,
    },
    last: {
      totalTokens: totalTokens + 5,
      inputTokens: totalTokens + 6,
      cachedInputTokens: totalTokens + 7,
      outputTokens: totalTokens + 8,
      reasoningOutputTokens: totalTokens + 9,
    },
    modelContextWindow: totalTokens + 100,
  };
}
