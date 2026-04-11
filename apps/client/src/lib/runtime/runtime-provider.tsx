import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";

import { bridgeBaseUrl } from "@/lib/env";
import { BrowserBridgeCredentialStore } from "@/lib/runtime/bridge-credential-store";
import { BridgeClient, BridgeThreadRuntime } from "@my-codex-app/sdk";

const RuntimeContext = createContext<BridgeThreadRuntime | null>(null);
const BridgeClientContext = createContext<BridgeClient | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [bridgeClient] = useState(
    () =>
      new BridgeClient({
        baseUrl: bridgeBaseUrl,
        credentialStore: new BrowserBridgeCredentialStore()
      })
  );
  const [runtime] = useState(() => new BridgeThreadRuntime(bridgeClient));

  useEffect(() => {
    void runtime.loadThreads();

    return () => {
      runtime.dispose();
    };
  }, [bridgeClient, runtime]);

  return (
    <BridgeClientContext.Provider value={bridgeClient}>
      <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
    </BridgeClientContext.Provider>
  );
}

export function useRuntime() {
  const runtime = useContext(RuntimeContext);

  if (!runtime) {
    throw new Error("useRuntime must be used within RuntimeProvider");
  }

  return runtime;
}

export function useBridgeClient() {
  const bridgeClient = useContext(BridgeClientContext);

  if (!bridgeClient) {
    throw new Error("useBridgeClient must be used within RuntimeProvider");
  }

  return bridgeClient;
}
