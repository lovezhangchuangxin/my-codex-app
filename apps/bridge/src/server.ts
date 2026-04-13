import { AppServerClient } from "./appServerClient";
import { BridgeAuthService } from "./auth/authService";
import { DeviceTrustStore } from "./auth/deviceTrustStore";
import { BridgeServer } from "./server/bridgeServer";
import { loadBridgeServerConfig } from "./server/config";
import { logPairingStatus } from "./server/logging";
import { ThreadEventStreamRegistry } from "./server/threadEventStreamRegistry";
import { ThreadService } from "./threadService";
import { WorkspaceService } from "./workspaceService";

async function main(): Promise<void> {
  const config = loadBridgeServerConfig();
  const appServerClient = new AppServerClient();
  await appServerClient.initialize();

  const authService = new BridgeAuthService(new DeviceTrustStore(config.bridgeStatePath));
  const threadService = new ThreadService(appServerClient);
  const workspaceService = new WorkspaceService(appServerClient);
  const eventRegistry = new ThreadEventStreamRegistry(
    threadService,
    config.threadUnsubscribeGraceMs
  );
  const unsubscribeEvents = threadService.onBridgeEvent((event) => {
    eventRegistry.broadcast(event);
  });
  const bridgeServer = new BridgeServer(config, {
    authService,
    threadService,
    workspaceService,
    eventRegistry
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    unsubscribeEvents();
    await bridgeServer.close().catch(() => {});
    await appServerClient.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  logPairingStatus(authService.getPairingStatus());
  bridgeServer.listen(() => {
    console.log(`Bridge listening on http://${config.host}:${config.port}`);
    console.log(`Bridge auth state path: ${config.bridgeStatePath}`);
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
