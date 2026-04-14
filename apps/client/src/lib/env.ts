import {
  resolveBridgeBaseUrl,
  toBridgeHealthUrl,
} from '@/lib/runtime/bridge-target-store';

export const bridgeBaseUrl = resolveBridgeBaseUrl();
export const bridgeHealthUrl = toBridgeHealthUrl(bridgeBaseUrl);
export const connectionModeLabel = 'Local';
