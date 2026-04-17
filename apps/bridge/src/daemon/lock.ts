import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

import { isProcessRunning } from './process.js';

export interface BridgeRuntimeLock {
  pid: number;
  acquiredAt: number;
}

export function readBridgeRuntimeLock(
  lockPath: string,
): BridgeRuntimeLock | null {
  if (!existsSync(lockPath)) {
    return null;
  }

  const raw = readFileSync(lockPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<BridgeRuntimeLock>;
  if (typeof parsed.pid !== 'number' || typeof parsed.acquiredAt !== 'number') {
    throw new Error(`Invalid bridge runtime lock at ${lockPath}`);
  }

  return {
    pid: parsed.pid,
    acquiredAt: parsed.acquiredAt,
  };
}

export function acquireBridgeRuntimeLock(
  lockPath: string,
): (() => void) | null {
  let existing: BridgeRuntimeLock | null = null;
  try {
    existing = readBridgeRuntimeLock(lockPath);
  } catch {
    existing = null;
  }
  if (existing && isProcessRunning(existing.pid)) {
    return null;
  }

  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore stale lock cleanup errors.
    }
  }

  try {
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }, null, 2)}\n`,
      { flag: 'wx', encoding: 'utf8' },
    );
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EEXIST'
    ) {
      return null;
    }
    throw error;
  }

  return () => {
    if (!existsSync(lockPath)) {
      return;
    }
    try {
      unlinkSync(lockPath);
    } catch {
      // Ignore lock cleanup errors on shutdown.
    }
  };
}
