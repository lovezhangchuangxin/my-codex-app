import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  bridgeCredentialStorageKey,
  hasStoredBridgeCredentials,
  notifyStoredBridgeCredentialsChanged,
  subscribeToBridgeCredentialChange,
} from '../src/lib/runtime/bridge-credential-events.ts';

class MemoryStorage {
  readonly #store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  clear(): void {
    this.#store.clear();
  }
}

class MockWindow extends EventTarget {
  readonly localStorage = new MemoryStorage();
}

const originalWindow = globalThis.window;

function setWindow(windowMock: Window & typeof globalThis) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowMock,
    writable: true,
  });
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
    return;
  }

  setWindow(originalWindow);
});

test('hasStoredBridgeCredentials flips to true for same bridge URL after credentials are stored', () => {
  const windowMock = new MockWindow() as Window & typeof globalThis;
  setWindow(windowMock);

  const baseUrl = 'http://127.0.0.1:8787';
  const storageKey = bridgeCredentialStorageKey(baseUrl);

  assert.equal(hasStoredBridgeCredentials(baseUrl), false);

  windowMock.localStorage.setItem(storageKey, '{"accessToken":"x"}');

  assert.equal(hasStoredBridgeCredentials(baseUrl), true);
});

test('credential change subscribers are notified for in-tab credential writes', () => {
  const windowMock = new MockWindow() as Window & typeof globalThis;
  setWindow(windowMock);

  let notifications = 0;
  const unsubscribe = subscribeToBridgeCredentialChange(() => {
    notifications += 1;
  });

  notifyStoredBridgeCredentialsChanged();
  unsubscribe();
  notifyStoredBridgeCredentialsChanged();

  assert.equal(notifications, 1);
});
