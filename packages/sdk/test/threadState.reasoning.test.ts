import assert from 'node:assert/strict';
import test from 'node:test';

import type { BridgeEvent, ThreadDetail } from '@my-codex-app/protocol';

import { applyThreadEvent } from '../src/threadState';

test('applyThreadEvent merges reasoning summary/content deltas and creates item when missing', () => {
  const thread = createThread();

  const withSummaryPart0 = applyThreadEvent(
    thread,
    reasoningEvent('reasoningSummaryPartAdded', {
      summaryIndex: 0,
    }),
  );
  const withSummary0 = applyThreadEvent(
    withSummaryPart0,
    reasoningEvent('reasoningSummaryTextDelta', {
      summaryIndex: 0,
      delta: 'First summary',
    }),
  );
  const withSummaryPart1 = applyThreadEvent(
    withSummary0,
    reasoningEvent('reasoningSummaryPartAdded', {
      summaryIndex: 1,
    }),
  );
  const withSummary1 = applyThreadEvent(
    withSummaryPart1,
    reasoningEvent('reasoningSummaryTextDelta', {
      summaryIndex: 1,
      delta: 'Second summary',
    }),
  );
  const withContent0 = applyThreadEvent(
    withSummary1,
    reasoningEvent('reasoningTextDelta', {
      contentIndex: 0,
      delta: 'raw-1',
    }),
  );
  const merged = applyThreadEvent(
    withContent0,
    reasoningEvent('reasoningTextDelta', {
      contentIndex: 0,
      delta: '-raw-2',
    }),
  );

  const item = merged.turns[0]?.items.find(
    (current) => current.type === 'reasoning' && current.id === 'reasoning-1',
  );
  assert.ok(item && item.type === 'reasoning');
  assert.deepEqual(item.summary, ['First summary', 'Second summary']);
  assert.deepEqual(item.content, ['raw-1-raw-2']);
});

test('applyThreadEvent keeps snapshot merge behavior with later reasoning deltas', () => {
  const thread = createThread();
  const live = applyThreadEvent(
    thread,
    reasoningEvent('reasoningSummaryTextDelta', {
      summaryIndex: 0,
      delta: 'streaming',
    }),
  );

  const withSnapshot = applyThreadEvent(live, {
    type: 'itemCompleted',
    threadId: 'thread-1',
    turnId: 'turn-1',
    item: {
      type: 'reasoning',
      id: 'reasoning-1',
      summary: ['snapshot summary'],
      content: ['snapshot content'],
    },
  });

  const merged = applyThreadEvent(
    withSnapshot,
    reasoningEvent('reasoningTextDelta', {
      contentIndex: 0,
      delta: ' + delta',
    }),
  );

  const item = merged.turns[0]?.items.find(
    (current) => current.type === 'reasoning' && current.id === 'reasoning-1',
  );
  assert.ok(item && item.type === 'reasoning');
  assert.deepEqual(item.summary, ['snapshot summary']);
  assert.deepEqual(item.content, ['snapshot content + delta']);
});

test('applyThreadEvent keeps streamed reasoning when snapshot is empty', () => {
  const thread = createThread();
  const withDelta = applyThreadEvent(
    thread,
    reasoningEvent('reasoningSummaryTextDelta', {
      summaryIndex: 0,
      delta: 'streamed-summary',
    }),
  );

  const withEmptySnapshot = applyThreadEvent(withDelta, {
    type: 'itemCompleted',
    threadId: 'thread-1',
    turnId: 'turn-1',
    item: {
      type: 'reasoning',
      id: 'reasoning-1',
      summary: [],
      content: [],
    },
  });

  const item = withEmptySnapshot.turns[0]?.items.find(
    (current) => current.type === 'reasoning' && current.id === 'reasoning-1',
  );
  assert.ok(item && item.type === 'reasoning');
  assert.deepEqual(item.summary, ['streamed-summary']);
  assert.deepEqual(item.content, []);
});

test('applyThreadEvent ignores repeated and invalid reasoning deltas', () => {
  const thread = createThread();
  const once = applyThreadEvent(
    thread,
    reasoningEvent('reasoningTextDelta', {
      contentIndex: 0,
      delta: 'abc',
    }),
  );

  const repeated = applyThreadEvent(
    once,
    reasoningEvent('reasoningTextDelta', {
      contentIndex: 0,
      delta: 'abc',
    }),
  );

  const invalidIndex = applyThreadEvent(repeated, {
    type: 'reasoningTextDelta',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'reasoning-1',
    contentIndex: Number.NaN,
    delta: 'should-not-append',
  });

  const item = invalidIndex.turns[0]?.items.find(
    (current) => current.type === 'reasoning' && current.id === 'reasoning-1',
  );
  assert.ok(item && item.type === 'reasoning');
  assert.deepEqual(item.content, ['abc']);
});

function createThread(): ThreadDetail {
  return {
    id: 'thread-1',
    preview: 'preview',
    createdAt: 1,
    updatedAt: 1,
    cwd: '/tmp/project',
    modelProvider: 'openai',
    status: { type: 'active', activeFlags: [] },
    pendingRequests: [],
    turns: [
      {
        id: 'turn-1',
        status: 'inProgress',
        items: [],
      },
    ],
    settings: null,
    contextUsage: null,
  };
}

function reasoningEvent(
  type:
    | 'reasoningSummaryPartAdded'
    | 'reasoningSummaryTextDelta'
    | 'reasoningTextDelta',
  payload:
    | { summaryIndex: number }
    | { summaryIndex: number; delta: string }
    | { contentIndex: number; delta: string },
): BridgeEvent {
  switch (type) {
    case 'reasoningSummaryPartAdded':
      return {
        type,
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'reasoning-1',
        summaryIndex: payload.summaryIndex,
      };
    case 'reasoningSummaryTextDelta':
      return {
        type,
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'reasoning-1',
        summaryIndex: payload.summaryIndex,
        delta: payload.delta,
      };
    case 'reasoningTextDelta':
      return {
        type,
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'reasoning-1',
        contentIndex: payload.contentIndex,
        delta: payload.delta,
      };
  }
}
