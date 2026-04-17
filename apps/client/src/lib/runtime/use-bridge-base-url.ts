import { useSyncExternalStore } from 'react';

import {
  resolveBridgeBaseUrl,
  subscribeToBridgeBaseUrlChange,
} from '@/lib/runtime/bridge-target-store';

export function useBridgeBaseUrl() {
  return useSyncExternalStore(
    subscribeToBridgeBaseUrlChange,
    resolveBridgeBaseUrl,
    resolveBridgeBaseUrl,
  );
}
