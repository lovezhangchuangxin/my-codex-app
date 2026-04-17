import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import type { BridgeVersionResponse } from '@my-codex-app/protocol';

export interface BridgeRuntimeManifest extends BridgeVersionResponse {
  version: 1;
  pid: number;
  host: string;
  port: number;
  bridgeUrl: string;
  configPath: string;
  statePath: string;
  projectStatePath: string;
  logPath: string;
  startedAt: number;
}

export function readBridgeRuntimeManifest(
  manifestPath: string,
): BridgeRuntimeManifest | null {
  if (!existsSync(manifestPath)) {
    return null;
  }

  const raw = readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<BridgeRuntimeManifest>;
  if (
    parsed.version !== 1 ||
    typeof parsed.pid !== 'number' ||
    typeof parsed.host !== 'string' ||
    typeof parsed.port !== 'number' ||
    typeof parsed.bridgeUrl !== 'string' ||
    typeof parsed.configPath !== 'string' ||
    typeof parsed.statePath !== 'string' ||
    typeof parsed.projectStatePath !== 'string' ||
    typeof parsed.logPath !== 'string' ||
    typeof parsed.startedAt !== 'number' ||
    typeof parsed.bridgePackageVersion !== 'string' ||
    typeof parsed.bridgeProtocolVersion !== 'number'
  ) {
    throw new Error(`Invalid bridge runtime manifest at ${manifestPath}`);
  }

  return {
    version: 1,
    pid: parsed.pid,
    host: parsed.host,
    port: parsed.port,
    bridgeUrl: parsed.bridgeUrl,
    configPath: parsed.configPath,
    statePath: parsed.statePath,
    projectStatePath: parsed.projectStatePath,
    logPath: parsed.logPath,
    startedAt: parsed.startedAt,
    bridgePackageVersion: parsed.bridgePackageVersion,
    bridgeProtocolVersion: parsed.bridgeProtocolVersion,
  };
}

export function writeBridgeRuntimeManifest(
  manifestPath: string,
  manifest: BridgeRuntimeManifest,
): void {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function removeBridgeRuntimeManifest(manifestPath: string): void {
  if (!existsSync(manifestPath)) {
    return;
  }

  try {
    unlinkSync(manifestPath);
  } catch {
    // No-op.
  }
}
