import { useSyncExternalStore } from 'react';

import { useRuntime } from '@/lib/runtime/runtime-context';

export function useRuntimeSnapshot() {
  const runtime = useRuntime();

  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
