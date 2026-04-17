import { useSyncExternalStore } from 'react';

import {
  hasStoredBridgeCredentials,
  subscribeToBridgeCredentialChange,
} from '@/lib/runtime/bridge-credential-events';

export function useStoredBridgeCredentials(baseUrl: string) {
  return useSyncExternalStore(
    subscribeToBridgeCredentialChange,
    () => hasStoredBridgeCredentials(baseUrl),
    () => hasStoredBridgeCredentials(baseUrl),
  );
}
