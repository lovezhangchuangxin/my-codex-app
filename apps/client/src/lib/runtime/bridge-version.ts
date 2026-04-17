import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeVersionResponse,
} from '@my-codex-app/protocol';
import { type BridgeClient, type BridgeThreadRuntime } from '@my-codex-app/sdk';

import type { MessageParams } from '@/lib/i18n/types';

type Translate = (key: string, params?: MessageParams) => string;

export function isCompatibleBridgeVersion(
  version: BridgeVersionResponse,
): boolean {
  return version.bridgeProtocolVersion === BRIDGE_PROTOCOL_VERSION;
}

export function formatIncompatibleBridgeVersionMessage(
  version: BridgeVersionResponse,
  t: Translate,
): string {
  return t('connection.error.incompatibleVersion', {
    actual: version.bridgeProtocolVersion,
    bridgeVersion: version.bridgePackageVersion,
    expected: BRIDGE_PROTOCOL_VERSION,
  });
}

export async function assertCompatibleBridgeVersion(
  bridgeClient: BridgeClient,
  t: Translate,
): Promise<BridgeVersionResponse> {
  const version = await bridgeClient.getBridgeVersion();
  if (!isCompatibleBridgeVersion(version)) {
    throw new Error(formatIncompatibleBridgeVersionMessage(version, t));
  }

  return version;
}

export async function ensureCompatibleBridgeVersionOrReport(
  bridgeClient: BridgeClient,
  runtime: BridgeThreadRuntime,
  t: Translate,
): Promise<boolean> {
  try {
    await assertCompatibleBridgeVersion(bridgeClient, t);
    return true;
  } catch (error) {
    runtime.reportConnectionFailure(toErrorMessage(error));
    return false;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
