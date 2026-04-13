import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { bridgeBaseUrl } from '@/lib/env';
import { BrowserBridgeCredentialStore } from '@/lib/runtime/bridge-credential-store';
import { BridgeClient, BridgeThreadRuntime } from '@my-codex-app/sdk';

const RuntimeContext = createContext<BridgeThreadRuntime | null>(null);
const BridgeClientContext = createContext<BridgeClient | null>(null);

interface RuntimeContainer {
  bridgeClient: BridgeClient;
  runtime: BridgeThreadRuntime;
}

function createRuntimeContainer(): RuntimeContainer {
  const bridgeClient = new BridgeClient({
    baseUrl: bridgeBaseUrl,
    credentialStore: new BrowserBridgeCredentialStore(),
  });

  return {
    bridgeClient,
    runtime: new BridgeThreadRuntime(bridgeClient),
  };
}

function isStaleRuntimeContainer(container: RuntimeContainer): boolean {
  return (
    !(container.bridgeClient instanceof BridgeClient) ||
    !(container.runtime instanceof BridgeThreadRuntime) ||
    typeof container.bridgeClient.listProjects !== 'function'
  );
}

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<RuntimeContainer>(() =>
    createRuntimeContainer(),
  );
  const runtime = container.runtime;
  const bridgeClient = container.bridgeClient;
  const staleContainer = isStaleRuntimeContainer(container);
  const disposeStateRef = useRef<{
    runtime: BridgeThreadRuntime;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useLayoutEffect(() => {
    if (!staleContainer) {
      return;
    }

    runtime.dispose();
    setContainer(createRuntimeContainer());
  }, [runtime, staleContainer]);

  useEffect(() => {
    if (disposeStateRef.current?.runtime === runtime) {
      window.clearTimeout(disposeStateRef.current.timer);
      disposeStateRef.current = null;
    }

    return () => {
      const timer = window.setTimeout(() => {
        runtime.dispose();
        if (disposeStateRef.current?.runtime === runtime) {
          disposeStateRef.current = null;
        }
      }, 0);

      disposeStateRef.current = {
        runtime,
        timer,
      };
    };
  }, [runtime]);

  useEffect(() => {
    if (staleContainer) {
      return;
    }

    void runtime.bootstrap();

    const retryConnection = () => {
      const { connection } = runtime.getSnapshot();
      if (connection.kind === 'authenticated') {
        return;
      }
      void runtime.retryConnection();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        retryConnection();
      }
    };

    window.addEventListener('focus', retryConnection);
    window.addEventListener('online', retryConnection);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', retryConnection);
      window.removeEventListener('online', retryConnection);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runtime, staleContainer]);

  if (staleContainer) {
    return null;
  }

  return (
    <BridgeClientContext.Provider value={bridgeClient}>
      <RuntimeContext.Provider value={runtime}>
        {children}
      </RuntimeContext.Provider>
    </BridgeClientContext.Provider>
  );
}

export function useRuntime() {
  const runtime = useContext(RuntimeContext);

  if (!runtime) {
    throw new Error('useRuntime must be used within RuntimeProvider');
  }

  return runtime;
}

export function useBridgeClient() {
  const bridgeClient = useContext(BridgeClientContext);

  if (!bridgeClient) {
    throw new Error('useBridgeClient must be used within RuntimeProvider');
  }

  return bridgeClient;
}
