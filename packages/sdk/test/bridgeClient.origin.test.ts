import assert from 'node:assert/strict';
import test from 'node:test';

import { BridgeClient } from '../src/bridgeClient.js';

/**
 * Tests for origin validation in BridgeClient.
 *
 * The guard lives in the private #buildUrl method. Since the SDK is
 * browser-only (uses window, EventSource, etc.), we test the guard logic
 * directly here and use BridgeClient only for constructor validation.
 */

// --- Guard logic mirror (same code as #buildUrl origin check) ---

function checkOrigin(baseUrl: string, path: string): boolean {
  const baseOrigin = new URL(baseUrl).origin;
  const url = new URL(path, baseUrl);
  return url.origin === baseOrigin;
}

// --- Constructor tests ---

test('constructor accepts various valid baseUrl formats', () => {
  const urls = [
    'http://localhost:5173',
    'http://192.168.1.7:8787',
    'http://10.0.0.1:3000',
    'https://example.com',
    'http://127.0.0.1:8080',
  ];
  for (const url of urls) {
    const client = new BridgeClient({ baseUrl: url });
    assert.ok(client, `Should create client for ${url}`);
  }
});

test('constructor throws on invalid baseUrl', () => {
  assert.throws(
    () => new BridgeClient({ baseUrl: 'not-a-url' }),
    'Should throw on invalid URL',
  );
});

// --- Origin guard logic tests ---

test('origin guard: allows relative paths', () => {
  assert.equal(checkOrigin('http://192.168.1.7:8787', '/api/pairing'), true);
  assert.equal(checkOrigin('http://localhost:5173', '/api/version'), true);
  assert.equal(checkOrigin('https://example.com', '/healthz'), true);
});

test('origin guard: allows same-origin absolute URLs', () => {
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'http://192.168.1.7:8787/api/pairing'),
    true,
  );
  assert.equal(
    checkOrigin('http://localhost:5173', 'http://localhost:5173/api/version'),
    true,
  );
});

test('origin guard: blocks different-origin absolute URLs', () => {
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'http://evil.com/api/pairing'),
    false,
  );
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'https://attacker.com/exfil'),
    false,
  );
  assert.equal(
    checkOrigin('http://localhost:5173', 'http://192.168.1.7:8787/api'),
    false,
  );
});

test('origin guard: blocks protocol-relative URLs to different origin', () => {
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', '//evil.com/steal'),
    false,
  );
});

test('origin guard: blocks data: and blob: and javascript: URLs', () => {
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'data:text/html,<script>alert(1)</script>'),
    false,
  );
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'blob:http://evil.com/xxx'),
    false,
  );
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'javascript:alert(1)'),
    false,
  );
});

test('origin guard: port differences are caught', () => {
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'http://192.168.1.7:9999/api'),
    false,
  );
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'http://192.168.1.7/api'),
    false,
  );
});

test('origin guard: scheme differences are caught', () => {
  assert.equal(
    checkOrigin('http://192.168.1.7:8787', 'https://192.168.1.7:8787/api'),
    false,
  );
});
