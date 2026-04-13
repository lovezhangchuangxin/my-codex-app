import { useSyncExternalStore } from 'react';

import { useRuntime } from '@/lib/runtime/runtime-provider';

export function useRuntimeSnapshot() {
  const runtime = useRuntime();

  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
