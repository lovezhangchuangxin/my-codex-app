import type { ThreadRuntimeStatus } from '@my-codex-app/protocol';

import { open } from 'node:fs/promises';

import { findRolloutPath } from './rolloutTokenUsage.js';

const READ_CHUNK_SIZE = 64 * 1024;

// Lifecycle events persisted to rollout files in Limited mode.
// See docs/reference/2026-04-18-codex-app-server-internals.md for the full
// persistence policy.
const ACTIVE_EVENTS = new Set(['turn_started', 'task_started']);
const COMPLETE_EVENTS = new Set([
  'turn_complete',
  'task_complete',
  'turn_aborted', // persisted in Limited mode; maps to idle
  'error', // persisted in Extended mode only; maps to idle
  'shutdown_complete', // never persisted (defensive match)
]);

// NOTE: The following event types are NEVER persisted to rollout files
// (persistence mode = None in codex-rs/rollout/src/policy.rs). They are kept
// here for correctness and in case upstream changes the policy, but will
// never match during backward scanning of current rollout files.
const APPROVAL_EVENTS = new Set([
  'request_permissions',
  'exec_approval_request',
  'apply_patch_approval_request',
]);
const INPUT_EVENTS = new Set(['request_user_input']);

/**
 * Infer a thread's runtime status by reading the tail of its rollout JSONL file.
 *
 * Scans backwards through the file looking for the most recent lifecycle event
 * (turn_started, turn_complete, request_permissions, request_user_input) and
 * maps it to a ThreadRuntimeStatus. Returns `null` when no rollout file exists
 * or no lifecycle event is found within the scanned range.
 */
export async function inferThreadStatus(
  codexHome: string,
  threadId: string,
): Promise<ThreadRuntimeStatus | null> {
  const rolloutPath = await findRolloutPath(codexHome, threadId);
  if (!rolloutPath) {
    return null;
  }

  const eventType = await findLastLifecycleEventType(rolloutPath);
  if (!eventType) {
    return null;
  }

  return mapEventTypeToStatus(eventType);
}

function mapEventTypeToStatus(eventType: string): ThreadRuntimeStatus | null {
  if (ACTIVE_EVENTS.has(eventType)) {
    return { type: 'active', activeFlags: [] };
  }
  if (COMPLETE_EVENTS.has(eventType)) {
    return { type: 'idle' };
  }
  if (APPROVAL_EVENTS.has(eventType)) {
    return { type: 'active', activeFlags: ['waitingOnApproval'] };
  }
  if (INPUT_EVENTS.has(eventType)) {
    return { type: 'active', activeFlags: ['waitingOnUserInput'] };
  }
  return null;
}

/**
 * Read the rollout file backwards (up to ~64KB from the tail) and return the
 * payload type of the first lifecycle event encountered. Returns `null` when
 * the file cannot be read, is empty, or contains no lifecycle events in the
 * scanned range.
 */
async function findLastLifecycleEventType(
  filePath: string,
): Promise<string | null> {
  let fileHandle;
  try {
    fileHandle = await open(filePath, 'r');
    const { size } = await fileHandle.stat();
    if (size === 0) {
      return null;
    }
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
        const eventType = parseLifecycleEventType(line);
        if (eventType) {
          return eventType;
        }
        lineEnd = cursor;
      }

      trailingBytes = combined.subarray(0, lineEnd);
    }

    return parseLifecycleEventType(trailingBytes);
  } catch {
    return null;
  } finally {
    await fileHandle?.close().catch(() => {});
  }
}

function parseLifecycleEventType(line: Uint8Array): string | null {
  const text = Buffer.from(line).toString('utf-8').trim();
  if (!text) {
    return null;
  }

  try {
    const record = JSON.parse(text);
    if (
      record?.type === 'event_msg' &&
      typeof record?.payload?.type === 'string'
    ) {
      const eventType = record.payload.type;
      if (
        ACTIVE_EVENTS.has(eventType) ||
        COMPLETE_EVENTS.has(eventType) ||
        APPROVAL_EVENTS.has(eventType) ||
        INPUT_EVENTS.has(eventType)
      ) {
        return eventType;
      }
    }
  } catch {
    // Incomplete JSON at chunk boundaries is expected; truly malformed lines
    // are silently skipped since rollout files are append-only and may have
    // partial writes at the tail.
  }

  return null;
}
