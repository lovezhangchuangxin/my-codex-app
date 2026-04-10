import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";

import { bridgeAccessToken, bridgeBaseUrl } from "@/lib/env";
import { BridgeClient, BridgeThreadRuntime } from "@my-codex-app/sdk";

const RuntimeContext = createContext<BridgeThreadRuntime | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(
    () =>
      new BridgeThreadRuntime(
        new BridgeClient({
          baseUrl: bridgeBaseUrl,
          accessToken: bridgeAccessToken
        })
      )
  );

  useEffect(() => {
    void runtime.loadThreads();

    return () => {
      runtime.dispose();
    };
  }, [runtime]);

  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  const runtime = useContext(RuntimeContext);

  if (!runtime) {
    throw new Error("useRuntime must be used within RuntimeProvider");
  }

  return runtime;
}
