import { dirname, join } from "node:path";

export interface BridgeServerConfig {
  port: number;
  host: string;
  bridgeOrigin: string;
  threadUnsubscribeGraceMs: number;
  bridgeStatePath: string;
  bridgeProjectStatePath: string;
}

export function loadBridgeServerConfig(): BridgeServerConfig {
  const bridgeStatePath =
    process.env.BRIDGE_STATE_PATH ?? join(process.cwd(), ".local", "bridge-auth-state.json");

  return {
    port: Number.parseInt(process.env.BRIDGE_PORT ?? "8787", 10),
    host: process.env.BRIDGE_HOST ?? "0.0.0.0",
    bridgeOrigin: process.env.BRIDGE_ORIGIN ?? "*",
    threadUnsubscribeGraceMs: Number.parseInt(
      process.env.BRIDGE_THREAD_UNSUBSCRIBE_GRACE_MS ?? "5000",
      10
    ),
    bridgeStatePath,
    bridgeProjectStatePath:
      process.env.BRIDGE_PROJECT_STATE_PATH ??
      join(dirname(bridgeStatePath), "bridge-project-state.json")
  };
}
