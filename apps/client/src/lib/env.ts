import {
  resolveBridgeBaseUrl,
  toBridgeHealthUrl,
} from '@/lib/runtime/bridge-target-store';

export function readBridgeBaseUrl() {
  return resolveBridgeBaseUrl();
}

export function readBridgeHealthUrl() {
  return toBridgeHealthUrl(readBridgeBaseUrl());
}

export const connectionModeLabel = 'Local';
