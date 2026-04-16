import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  BridgeEvent,
  ThreadDetail,
  TurnDetail,
} from '@my-codex-app/protocol';

import {
  applyThreadEvent,
  createInitialSnapshot,
  findActiveTurnId,
} from '../src/threadState';

test('findActiveTurnId returns null when no turn is inProgress', () => {
  const thread = createThread([
    turn('turn-1', 'completed'),
    turn('turn-2', 'completed'),
  ]);
  assert.equal(findActiveTurnId(thread), null);
});

test('findActiveTurnId returns the latest inProgress turn', () => {
  const thread = createThread([
    turn('turn-1', 'completed'),
    turn('turn-2', 'inProgress'),
  ]);
  assert.equal(findActiveTurnId(thread), 'turn-2');
});

test('findActiveTurnId returns null for empty turns', () => {
  const thread = createThread([]);
  assert.equal(findActiveTurnId(thread), null);
});

test('turnCompleted event clears activeTurnId enabling next send', () => {
  const thread = createThread([turn('turn-1', 'inProgress')]);
  assert.equal(findActiveTurnId(thread), 'turn-1');

  const event: BridgeEvent = {
    type: 'turnCompleted',
    threadId: 'thread-1',
    turn: turn('turn-1', 'completed'),
  };

  const updated = applyThreadEvent(thread, event);
  assert.equal(findActiveTurnId(updated), null);
});

test('pendingMessages is initialised as empty in initial snapshot', () => {
  const snapshot = createInitialSnapshot(true);
  assert.ok(snapshot.mutations.pendingMessages instanceof Map);
  assert.equal(snapshot.mutations.pendingMessages.size, 0);
});

test('turnStarted sets activeTurnId', () => {
  const thread = createThread([]);
  const event: BridgeEvent = {
    type: 'turnStarted',
    threadId: 'thread-1',
    turn: turn('turn-new', 'inProgress'),
  };
  const updated = applyThreadEvent(thread, event);
  assert.equal(findActiveTurnId(updated), 'turn-new');
});

test('interrupted turn clears activeTurnId', () => {
  const thread = createThread([turn('turn-1', 'inProgress')]);
  const event: BridgeEvent = {
    type: 'turnCompleted',
    threadId: 'thread-1',
    turn: turn('turn-1', 'interrupted'),
  };
  const updated = applyThreadEvent(thread, event);
  assert.equal(findActiveTurnId(updated), null);
});

function createThread(turns: TurnDetail[] = []): ThreadDetail {
  return {
    id: 'thread-1',
    name: undefined,
    preview: '',
    createdAt: 1,
    updatedAt: 2,
    cwd: '/project',
    modelProvider: 'openai',
    status: { type: 'idle' },
    pendingRequests: [],
    turns,
    settings: null,
    contextUsage: null,
  };
}

function turn(id: string, status: TurnDetail['status']): TurnDetail {
  return {
    id,
    status,
    items: [],
    startedAt: 1,
    completedAt: status === 'inProgress' ? undefined : 2,
  };
}
