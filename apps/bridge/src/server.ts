import { AppServerClient } from './appServerClient.js';
import { BridgeAuthService } from './auth/authService.js';
import { DeviceTrustStore } from './auth/deviceTrustStore.js';
import { acquireBridgeRuntimeLock } from './daemon/lock.js';
import {
  removeBridgeRuntimeManifest,
  writeBridgeRuntimeManifest,
} from './daemon/runtimeManifest.js';
import { ProjectService } from './projectService.js';
import { ProjectRegistryStore } from './projects/projectRegistryStore.js';
import { BridgeServer } from './server/bridgeServer.js';
import {
  loadBridgeServerConfig,
  type BridgeConfigOverrides,
} from './server/config.js';
import { renderPairingStatus, resolveBridgeQrUrl } from './server/logging.js';
import { ThreadEventStreamRegistry } from './server/threadEventStreamRegistry.js';
import { ThreadService } from './threadService.js';
import { WorkspaceService } from './workspaceService.js';
import { BRIDGE_PACKAGE_VERSION, BRIDGE_PROTOCOL_VERSION } from './version.js';

export interface RunBridgeDaemonOptions {
  daemonized?: boolean;
  configOverrides?: BridgeConfigOverrides;
}

export async function runBridgeDaemon(
  options: RunBridgeDaemonOptions = {},
): Promise<void> {
  const config = loadBridgeServerConfig(options.configOverrides ?? {});
  const releaseLock = acquireBridgeRuntimeLock(config.runtimeLockPath);
  if (!releaseLock) {
    throw new Error('Bridge daemon is already running');
  }

  const appServerClient = new AppServerClient();
  try {
    const initializeResult = await appServerClient.initialize();
    const authService = new BridgeAuthService(
      new DeviceTrustStore(config.authStatePath),
    );
    const threadService = new ThreadService(
      appServerClient,
      initializeResult.codexHome,
    );
    const projectService = new ProjectService(
      new ProjectRegistryStore(config.projectStatePath),
      threadService,
    );
    const workspaceService = new WorkspaceService(appServerClient);
    const eventRegistry = new ThreadEventStreamRegistry(
      threadService,
      config.threadUnsubscribeGraceMs,
    );
    const unsubscribeEvents = threadService.onBridgeEvent((event) => {
      eventRegistry.broadcast(event);
    });
    const bridgeServer = new BridgeServer(config, {
      authService,
      projectService,
      threadService,
      workspaceService,
      eventRegistry,
    });

    let shuttingDown = false;
    let shutdownResolve: (() => void) | null = null;
    const shutdownPromise = new Promise<void>((resolve) => {
      shutdownResolve = resolve;
    });

    const shutdown = async (): Promise<void> => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      unsubscribeEvents();
      try {
        await bridgeServer.close();
      } catch {
        // Ignore shutdown errors.
      }
      try {
        await appServerClient.close();
      } catch {
        // Ignore shutdown errors.
      }
      removeBridgeRuntimeManifest(config.runtimeManifestPath);
      releaseLock();
    };

    const handleSignal = (_signal: NodeJS.Signals): void => {
      void shutdown()
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error);
          console.error(message);
          process.exitCode = 1;
        })
        .finally(() => {
          shutdownResolve?.();
        });
    };

    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);

    try {
      await bridgeServer.listen(() => {});
      writeBridgeRuntimeManifest(config.runtimeManifestPath, {
        version: 1,
        pid: process.pid,
        host: config.host,
        port: config.port,
        bridgeUrl: config.bridgeUrl,
        configPath: config.configPath,
        statePath: config.authStatePath,
        projectStatePath: config.projectStatePath,
        logPath: config.logPath,
        startedAt: Date.now(),
        bridgePackageVersion: BRIDGE_PACKAGE_VERSION,
        bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
      });
    } catch (error) {
      await shutdown();
      throw error;
    }

    console.log(`Bridge listening on ${config.bridgeUrl}`);
    console.log(`Bridge config path: ${config.configPath}`);
    console.log(`Bridge auth state path: ${config.authStatePath}`);
    console.log(`Bridge project state path: ${config.projectStatePath}`);
    console.log(`Bridge log path: ${config.logPath}`);

    if (!options.daemonized) {
      const bridgeUrl = resolveBridgeQrUrl(
        config.host,
        config.port,
        config.bridgeUrl,
      );
      renderPairingStatus(authService.getPairingStatus(), bridgeUrl);
    }

    await shutdownPromise;
  } catch (error) {
    try {
      await appServerClient.close();
    } catch {
      // Ignore close errors during startup failures.
    }
    releaseLock();
    throw error;
  }
}
