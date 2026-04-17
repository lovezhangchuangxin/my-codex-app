import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { bridgeBaseUrl } from '@/lib/env';
import { useI18n } from '@/lib/i18n/use-i18n';
import { BrowserBridgeCredentialStore } from '@/lib/runtime/bridge-credential-store';
import { ensureCompatibleBridgeVersionOrReport } from '@/lib/runtime/bridge-version';
import {
  BridgeClientContext,
  RuntimeContext,
} from '@/lib/runtime/runtime-context';
import { BridgeClient, BridgeThreadRuntime } from '@my-codex-app/sdk';

interface RuntimeContainer {
  bridgeClient: BridgeClient;
  runtime: BridgeThreadRuntime;
}

function createRuntimeContainer(): RuntimeContainer {
  const bridgeClient = new BridgeClient({
    baseUrl: bridgeBaseUrl,
    credentialStore: new BrowserBridgeCredentialStore(bridgeBaseUrl),
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
  const { t } = useI18n();
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
  const translateRef = useRef(t);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

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

    let cancelled = false;

    const bootstrapRuntime = async () => {
      if (bridgeClient.hasCredentials()) {
        const isCompatible = await ensureCompatibleBridgeVersionOrReport(
          bridgeClient,
          runtime,
          translateRef.current,
        );
        if (!isCompatible || cancelled) {
          return;
        }
      }

      if (cancelled) {
        return;
      }

      await runtime.bootstrap();
    };

    const retryConnection = () => {
      const { connection } = runtime.getSnapshot();
      if (connection.kind === 'authenticated') {
        return;
      }

      void (async () => {
        if (bridgeClient.hasCredentials()) {
          const isCompatible = await ensureCompatibleBridgeVersionOrReport(
            bridgeClient,
            runtime,
            translateRef.current,
          );
          if (!isCompatible || cancelled) {
            return;
          }
        }

        if (cancelled) {
          return;
        }

        await runtime.retryConnection();
      })();
    };

    void bootstrapRuntime();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        retryConnection();
      }
    };

    window.addEventListener('focus', retryConnection);
    window.addEventListener('online', retryConnection);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', retryConnection);
      window.removeEventListener('online', retryConnection);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [bridgeClient, runtime, staleContainer]);

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
