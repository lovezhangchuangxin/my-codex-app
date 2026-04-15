import { createContext, useContext } from 'react';

import type { BridgeClient, BridgeThreadRuntime } from '@my-codex-app/sdk';

export const RuntimeContext = createContext<BridgeThreadRuntime | null>(null);
export const BridgeClientContext = createContext<BridgeClient | null>(null);

export function useRuntime(): BridgeThreadRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error('useRuntime must be used within RuntimeProvider');
  }
  return runtime;
}

export function useBridgeClient(): BridgeClient {
  const bridgeClient = useContext(BridgeClientContext);
  if (!bridgeClient) {
    throw new Error('useBridgeClient must be used within RuntimeProvider');
  }
  return bridgeClient;
}
