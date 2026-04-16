import assert from 'node:assert/strict';
import test from 'node:test';

import type { ServerResponse } from 'node:http';

import { ThreadEventStreamRegistry } from '../src/server/threadEventStreamRegistry';

test('ThreadEventStreamRegistry delays unsubscribe until thread can unload', async () => {
  const threadService = new FakeThreadService([false, true]);
  const registry = new ThreadEventStreamRegistry(threadService as never, 20);

  const client = await registry.addClient(createResponse(), 'thread-1');
  registry.removeClient(client);

  await waitFor(() => threadService.canUnloadCalls >= 1);
  assert.equal(threadService.unsubscribeCalls, 0);

  await waitFor(() => threadService.unsubscribeCalls >= 1);
  assert.equal(threadService.resumeCalls, 1);
  assert.equal(threadService.canUnloadCalls, 2);
});

test('ThreadEventStreamRegistry unsubscribes immediately when thread is idle', async () => {
  const threadService = new FakeThreadService([true]);
  const registry = new ThreadEventStreamRegistry(threadService as never, 0);

  const client = await registry.addClient(createResponse(), 'thread-1');
  registry.removeClient(client);

  await waitFor(() => threadService.unsubscribeCalls >= 1);
  assert.equal(threadService.resumeCalls, 1);
  assert.equal(threadService.canUnloadCalls, 1);
});

test('ThreadEventStreamRegistry never unsubscribes while thread stays active', async () => {
  // Thread remains active for all checks - should never unsubscribe.
  const threadService = new FakeThreadService([false, false, false, false]);
  const registry = new ThreadEventStreamRegistry(threadService as never, 10);

  const client = await registry.addClient(createResponse(), 'thread-1');
  registry.removeClient(client);

  // Wait for several re-schedule cycles to fire.
  await waitFor(() => threadService.canUnloadCalls >= 3, 2_000);
  assert.equal(threadService.unsubscribeCalls, 0);
});

test('ThreadEventStreamRegistry reconnecting client cancels pending unsubscribe for active thread', async () => {
  const threadService = new FakeThreadService([false]);
  const registry = new ThreadEventStreamRegistry(threadService as never, 50);

  const client1 = await registry.addClient(createResponse(), 'thread-1');
  registry.removeClient(client1);

  // Before the grace period elapses, a new client reconnects.
  const client2 = await registry.addClient(createResponse(), 'thread-1');

  // Wait well past the original grace period.
  await delay(150);
  assert.equal(
    threadService.canUnloadCalls,
    0,
    'should not check canUnload because timer was cancelled',
  );
  assert.equal(threadService.unsubscribeCalls, 0);

  // Cleanup.
  registry.removeClient(client2);
});

class FakeThreadService {
  resumeCalls = 0;
  unsubscribeCalls = 0;
  canUnloadCalls = 0;

  constructor(private readonly canUnloadSequence: boolean[]) {}

  async resumeThread(): Promise<void> {
    this.resumeCalls += 1;
  }

  async canUnloadThread(): Promise<boolean> {
    this.canUnloadCalls += 1;
    return this.canUnloadSequence.shift() ?? true;
  }

  async unsubscribeThread(): Promise<void> {
    this.unsubscribeCalls += 1;
  }
}

function createResponse(): ServerResponse {
  return {
    write: () => true,
    end: () => undefined,
  } as unknown as ServerResponse;
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 1_000,
  stepMs = 10,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (condition()) {
      return;
    }
    await delay(stepMs);
  }

  throw new Error('Timed out waiting for expected condition');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
