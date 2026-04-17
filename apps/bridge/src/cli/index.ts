#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type {
  BridgeDaemonStatusResponse,
  BridgeVersionResponse,
  DeviceTrustRecord,
  PairingStatusResponse,
} from '@my-codex-app/protocol';

import { BridgeAuthService } from '../auth/authService.js';
import { DeviceTrustStore } from '../auth/deviceTrustStore.js';
import { readBridgeRuntimeLock } from '../daemon/lock.js';
import { isProcessRunning, terminateProcess } from '../daemon/process.js';
import {
  ensureBridgeRuntimeDirectories,
  resolveBridgeRuntimePaths,
  type BridgeRuntimePaths,
} from '../daemon/paths.js';
import {
  readBridgeRuntimeManifest,
  type BridgeRuntimeManifest,
} from '../daemon/runtimeManifest.js';
import { BRIDGE_PACKAGE_VERSION, BRIDGE_PROTOCOL_VERSION } from '../version.js';
import {
  getBridgeConfigValue,
  loadBridgeServerConfig,
  readBridgeConfigFile,
  resetBridgeConfigFile,
  type BridgeConfigOverrides,
  type BridgeConfigKey,
  type BridgeServerConfig,
  updateBridgeConfigFile,
  writeBridgeConfigFile,
} from '../server/config.js';
import {
  createPairingPayload,
  renderPairingStatus,
  resolveBridgeQrUrl,
} from '../server/logging.js';
import { ProjectRegistryStore } from '../projects/projectRegistryStore.js';
import {
  normalizeAbsolutePath,
  getProjectDisplayName,
} from '../projects/projectPathUtils.js';
import { runBridgeDaemon } from '../server.js';

interface CliFlags {
  json: boolean;
  help: boolean;
  daemonized: boolean;
  follow: boolean;
  host?: string;
  port?: number;
  bridgeUrl?: string;
  runtimeRoot?: string;
  statePath?: string;
  projectStatePath?: string;
  logPath?: string;
  corsOrigins?: string[];
  threadUnsubscribeGraceMs?: number;
  tail?: number;
  shell?: string;
}

interface ParsedArgs {
  flags: CliFlags;
  positionals: string[];
}

interface LiveRuntimeState {
  manifest: BridgeRuntimeManifest | null;
  lock: { pid: number; acquiredAt: number } | null;
  live: BridgeRuntimeManifest | null;
  startingPid: number | null;
}

interface CommandResult {
  exitCode?: number;
}

const DEFAULT_LOG_TAIL_LINES = 200;
const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 10_000;
const LOG_POLL_INTERVAL_MS = 1_000;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed.positionals.length === 0 || parsed.flags.help) {
    printHelp();
    return;
  }

  const [command, subcommand, ...rest] = parsed.positionals;
  const result = await dispatchCommand(command, subcommand, rest, parsed.flags);
  if (result.exitCode && result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

async function dispatchCommand(
  command: string | undefined,
  subcommand: string | undefined,
  rest: string[],
  flags: CliFlags,
): Promise<CommandResult> {
  if (!command) {
    printHelp();
    return {};
  }

  switch (command) {
    case 'start':
      await handleStart(flags);
      return {};
    case 'run':
      await handleRun(flags);
      return {};
    case 'stop':
      await handleStop(flags);
      return {};
    case 'restart':
      await handleRestart(flags);
      return {};
    case 'status':
      await handleStatus(flags);
      return {};
    case 'logs':
      await handleLogs(flags);
      return {};
    case 'doctor':
      await handleDoctor(flags);
      return {};
    case 'version':
      await handleVersion(flags);
      return {};
    case 'pair':
      await handlePair(subcommand, rest, flags);
      return {};
    case 'devices':
      await handleDevices(subcommand, rest, flags);
      return {};
    case 'config':
      await handleConfig(subcommand, rest, flags);
      return {};
    case 'projects':
      await handleProjects(subcommand, rest, flags);
      return {};
    case 'completion':
      await handleCompletion(flags);
      return {};
    case '-h':
    case '--help':
      printHelp();
      return {};
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      return { exitCode: 1 };
  }
}

async function handleStart(flags: CliFlags): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const liveRuntime = getLiveRuntime(config);
  if (liveRuntime.live) {
    const status = await getDaemonStatus(config);
    await printStartOutput(config, status, flags.json);
    return;
  }

  if (liveRuntime.startingPid !== null) {
    await waitForDaemonReady(config, liveRuntime.startingPid);
    const manifest = readLiveManifest(config);
    const status = manifest
      ? await getDaemonStatus(config)
      : createRunningStatusFromConfig(config, liveRuntime.startingPid);
    await printStartOutput(config, status, flags.json);
    return;
  }

  if (liveRuntime.manifest && !liveRuntime.live) {
    removeStaleRuntimeArtifacts(config);
  }

  const entryFile = fileURLToPath(import.meta.url);
  const logFd = openSync(config.logPath, 'a');
  const child = spawn(
    process.execPath,
    [
      ...process.execArgv,
      entryFile,
      'run',
      '--daemonized',
      ...serializeConfigArgs(flags),
    ],
    {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    },
  );
  child.unref();
  closeSync(logFd);

  await waitForDaemonReady(config, child.pid ?? null);
  const manifest = readLiveManifest(config);
  const status = manifest
    ? await getDaemonStatus(config)
    : createRunningStatusFromConfig(config, child.pid ?? null);
  await printStartOutput(config, status, flags.json);
}

async function handleRun(flags: CliFlags): Promise<void> {
  await runBridgeDaemon({
    daemonized: flags.daemonized,
    configOverrides: toConfigOverrides(flags),
  });
}

async function handleStop(flags: CliFlags): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const live = readLiveRuntime(config);
  if (live.live === null && live.startingPid === null) {
    if (live.manifest) {
      removeStaleRuntimeArtifacts(config);
    }
    printJsonOrHuman(
      flags.json,
      { stopped: false, message: 'Bridge daemon is not running' },
      'Bridge daemon is not running',
    );
    return;
  }

  const pid = live?.live?.pid ?? live?.startingPid ?? null;
  if (pid === null) {
    printJsonOrHuman(
      flags.json,
      { stopped: false, message: 'Bridge daemon is not running' },
      'Bridge daemon is not running',
    );
    return;
  }

  try {
    terminateProcess(pid, 'SIGTERM');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to stop bridge daemon: ${message}`);
  }

  await waitForDaemonExit(config, pid);
  removeStaleRuntimeArtifacts(config);
  printJsonOrHuman(flags.json, { stopped: true }, 'Bridge daemon stopped');
}

async function handleRestart(flags: CliFlags): Promise<void> {
  try {
    await handleStop(flags);
  } catch {
    // Ignore stop failures during restart; start will surface real errors.
  }
  await handleStart(flags);
}

async function handleStatus(flags: CliFlags): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const status = await getDaemonStatus(config);
  if (flags.json) {
    printJson(status);
    return;
  }

  printStatus(status);
}

async function handleLogs(flags: CliFlags): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const runtime = readLiveRuntime(config);
  const logPath = runtime?.live?.logPath ?? config.logPath;
  const tail = normalizeTailCount(flags.tail);
  if (!existsSync(logPath)) {
    console.log(`No log file found at ${logPath}`);
    return;
  }

  if (flags.follow) {
    await followLogFile(logPath, tail);
    return;
  }

  console.log(await readLogTail(logPath, tail));
}

async function handleDoctor(flags: CliFlags): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const checks: DoctorCheck[] = [];

  checks.push({
    name: 'config',
    ok: true,
    message: `Config path: ${config.configPath}`,
  });

  const codexCheck = await checkCodexAvailability();
  checks.push(codexCheck);

  const live = getLiveRuntime(config);
  if (live.live || live.startingPid !== null) {
    const status = await getDaemonStatus(config);
    checks.push({
      name: 'daemon',
      ok: status.reachable || live.startingPid !== null,
      message: status.reachable
        ? `Running at ${status.bridgeUrl}`
        : (status.message ?? 'Running but unreachable'),
    });
  } else {
    const portConflict = await canBindPort(config.host, config.port);
    checks.push({
      name: 'port',
      ok: portConflict.ok,
      message: portConflict.message,
    });
  }

  const ok = checks.every((check) => check.ok);
  if (flags.json) {
    printJson({ ok, checks });
    return;
  }

  for (const check of checks) {
    console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.name}: ${check.message}`);
  }
  if (!ok) {
    process.exitCode = 1;
  }
}

async function handleVersion(flags: CliFlags): Promise<void> {
  const payload: BridgeVersionResponse = {
    bridgePackageVersion: BRIDGE_PACKAGE_VERSION,
    bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
  };
  if (flags.json) {
    printJson(payload);
    return;
  }

  console.log(`codexb ${payload.bridgePackageVersion}`);
  console.log(`bridge protocol ${payload.bridgeProtocolVersion}`);
}

async function handlePair(
  subcommand: string | undefined,
  rest: string[],
  flags: CliFlags,
): Promise<void> {
  switch (subcommand) {
    case 'show':
      await handlePairShow(flags);
      return;
    case 'refresh':
      await handlePairRefresh(flags);
      return;
    default:
      throw new Error('Usage: codexb pair show|refresh');
  }
}

async function handlePairShow(flags: CliFlags): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const live = getLiveRuntime(config);
  const bridgeUrl =
    live.live?.bridgeUrl ??
    resolveBridgeQrUrl(config.host, config.port, config.bridgeUrl);
  const pairing = await getPairingStatusForDisplay(config, {
    strictLiveDaemon: true,
  });
  const qrPayload = createPairingPayload(bridgeUrl, pairing.pairingCode);

  if (flags.json) {
    printJson({
      pairingRequired: pairing.pairingRequired,
      instructions: pairing.instructions,
      expiresAt: pairing.expiresAt,
      pairingCode: pairing.pairingCode,
      bridgeUrl,
      qrPayload,
    });
    return;
  }

  renderPairingStatus(pairing, bridgeUrl);
}

async function handlePairRefresh(flags: CliFlags): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const auth = loadAuthService(config);
  const pairing = auth.refreshPairingStatus();
  const live = getLiveRuntime(config);
  const bridgeUrl =
    live.live?.bridgeUrl ??
    resolveBridgeQrUrl(config.host, config.port, config.bridgeUrl);
  if (flags.json) {
    printJson({
      pairingRequired: pairing.pairingRequired,
      instructions: pairing.instructions,
      expiresAt: pairing.expiresAt,
      pairingCode: pairing.pairingCode,
      bridgeUrl,
      qrPayload: createPairingPayload(bridgeUrl, pairing.pairingCode),
    });
    return;
  }

  renderPairingStatus(pairing, bridgeUrl);
}

async function handleDevices(
  subcommand: string | undefined,
  rest: string[],
  flags: CliFlags,
): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const auth = loadAuthService(config);

  switch (subcommand) {
    case 'list': {
      const payload = auth.listDevices();
      if (flags.json) {
        printJson(payload);
        return;
      }
      printDeviceList(payload.devices);
      return;
    }
    case 'revoke': {
      const deviceId = rest[0];
      if (!deviceId) {
        throw new Error('Usage: codexb devices revoke <deviceId>');
      }
      const payload = auth.revokeDevice(deviceId);
      printJsonOrHuman(flags.json, payload, `Revoked device ${deviceId}`);
      return;
    }
    case 'delete': {
      const deviceId = rest[0];
      if (!deviceId) {
        throw new Error('Usage: codexb devices delete <deviceId>');
      }
      const payload = auth.deleteDevice(deviceId);
      printJsonOrHuman(flags.json, payload, `Deleted device ${deviceId}`);
      return;
    }
    default:
      throw new Error('Usage: codexb devices list|revoke|delete');
  }
}

async function handleConfig(
  subcommand: string | undefined,
  rest: string[],
  flags: CliFlags,
): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  switch (subcommand) {
    case 'show': {
      const payload = configToJson(config);
      if (flags.json) {
        printJson(payload);
        return;
      }
      printKeyValues(payload);
      return;
    }
    case 'get': {
      const key = rest[0] as BridgeConfigKey | undefined;
      if (!key) {
        throw new Error('Usage: codexb config get <key>');
      }
      const value = getBridgeConfigValue(config, key);
      if (flags.json) {
        printJson({ key, value });
        return;
      }
      if (Array.isArray(value)) {
        console.log(value.join(', '));
      } else if (value === undefined) {
        console.log('');
      } else {
        console.log(String(value));
      }
      return;
    }
    case 'set': {
      const key = rest[0] as BridgeConfigKey | undefined;
      const value = rest.slice(1).join(' ');
      if (!key || value.trim().length === 0) {
        throw new Error('Usage: codexb config set <key> <value>');
      }
      const runtimePaths = resolveBridgeRuntimePaths(config.runtimeRoot);
      ensureBridgeRuntimeDirectories(runtimePaths);
      const next = updateBridgeConfigFile(
        runtimePaths.configPath,
        (current) => {
          const patch = { ...current };
          switch (key) {
            case 'host':
              patch.host = value;
              break;
            case 'port':
              patch.port = normalizePositiveInt(value);
              break;
            case 'bridgeUrl':
              patch.bridgeUrl = value;
              break;
            case 'corsOrigins':
              patch.corsOrigins = value
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
              break;
            case 'threadUnsubscribeGraceMs':
              patch.threadUnsubscribeGraceMs = normalizePositiveInt(value);
              break;
            case 'statePath':
              patch.statePath = value;
              break;
            case 'projectStatePath':
              patch.projectStatePath = value;
              break;
            case 'logPath':
              patch.logPath = value;
              break;
            default:
              throw new Error(`Config key ${key} cannot be set directly`);
          }
          return patch;
        },
      );
      if (flags.json) {
        printJson(next);
        return;
      }
      console.log(`Updated ${key}`);
      return;
    }
    case 'edit': {
      const runtimePaths = resolveBridgeRuntimePaths(config.runtimeRoot);
      ensureBridgeRuntimeDirectories(runtimePaths);
      if (!readBridgeConfigFile(runtimePaths.configPath)) {
        resetBridgeConfigFile(runtimePaths.configPath);
      }
      await openInEditor(runtimePaths.configPath);
      return;
    }
    case 'reset': {
      const runtimePaths = resolveBridgeRuntimePaths(config.runtimeRoot);
      ensureBridgeRuntimeDirectories(runtimePaths);
      resetBridgeConfigFile(runtimePaths.configPath);
      printJsonOrHuman(
        flags.json,
        { reset: true },
        `Reset config at ${runtimePaths.configPath}`,
      );
      return;
    }
    default:
      throw new Error('Usage: codexb config show|get|set|edit|reset');
  }
}

async function handleProjects(
  subcommand: string | undefined,
  rest: string[],
  flags: CliFlags,
): Promise<void> {
  const config = loadBridgeServerConfig(toConfigOverrides(flags));
  const store = loadProjectStore(config);

  switch (subcommand) {
    case 'list': {
      store.reload();
      const payload = { data: store.listProjects() };
      if (flags.json) {
        printJson(payload);
        return;
      }
      printProjectList(payload.data);
      return;
    }
    case 'import': {
      const rawPath = rest[0];
      if (!rawPath) {
        throw new Error('Usage: codexb projects import <path>');
      }
      store.reload();
      const canonicalPath = await resolveImportProjectPath(rawPath);
      const project = store.upsertProject(canonicalPath, nowInSeconds());
      if (flags.json) {
        printJson({ project });
        return;
      }
      console.log(`Imported ${project.path}`);
      return;
    }
    case 'remove': {
      const rawPath = rest[0];
      if (!rawPath) {
        throw new Error('Usage: codexb projects remove <path>');
      }
      store.reload();
      const canonicalPath = await resolveImportProjectPath(rawPath);
      const removed = store.removeProject(canonicalPath);
      printJsonOrHuman(
        flags.json,
        { removed },
        removed
          ? `Removed ${canonicalPath}`
          : `Project not found: ${canonicalPath}`,
      );
      if (!removed) {
        process.exitCode = 1;
      }
      return;
    }
    default:
      throw new Error('Usage: codexb projects list|import|remove');
  }
}

async function handleCompletion(flags: CliFlags): Promise<void> {
  const shell = normalizeShell(flags.shell ?? process.env.SHELL);
  const script = generateCompletionScript(shell);
  console.log(script);
}

async function getDaemonStatus(
  config: BridgeServerConfig,
): Promise<BridgeDaemonStatusResponse> {
  const live = getLiveRuntime(config);
  if (live?.live) {
    const baseUrl = live.live.bridgeUrl;
    try {
      const [version, pairing] = await Promise.all([
        fetchJson<BridgeVersionResponse>(
          new URL('/api/version', baseUrl).toString(),
        ),
        fetchJson<{
          pairingRequired: boolean;
          instructions: string;
          expiresAt: number;
        }>(new URL('/api/pairing', baseUrl).toString()),
      ]);
      return {
        running: true,
        reachable: true,
        pid: live.live.pid,
        host: live.live.host,
        port: live.live.port,
        bridgeUrl: live.live.bridgeUrl,
        startedAt: live.live.startedAt,
        pairingRequired: pairing.pairingRequired,
        pairingExpiresAt: pairing.expiresAt,
        configPath: live.live.configPath,
        statePath: live.live.statePath,
        projectStatePath: live.live.projectStatePath,
        logPath: live.live.logPath,
        runtimeManifestPath: config.runtimeManifestPath,
        version,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        running: true,
        reachable: false,
        pid: live.live.pid,
        host: live.live.host,
        port: live.live.port,
        bridgeUrl: live.live.bridgeUrl,
        startedAt: live.live.startedAt,
        pairingRequired: null,
        pairingExpiresAt: null,
        configPath: live.live.configPath,
        statePath: live.live.statePath,
        projectStatePath: live.live.projectStatePath,
        logPath: live.live.logPath,
        runtimeManifestPath: config.runtimeManifestPath,
        version: null,
        message,
      };
    }
  }

  if (live.startingPid !== null) {
    return {
      running: true,
      reachable: false,
      pid: live.startingPid,
      host: live.manifest?.host ?? config.host,
      port: live.manifest?.port ?? config.port,
      bridgeUrl: live.manifest?.bridgeUrl ?? config.bridgeUrl,
      startedAt: live.manifest?.startedAt ?? null,
      pairingRequired: null,
      pairingExpiresAt: null,
      configPath: config.configPath,
      statePath: config.authStatePath,
      projectStatePath: config.projectStatePath,
      logPath: config.logPath,
      runtimeManifestPath: config.runtimeManifestPath,
      version: null,
      message: 'Bridge daemon is starting',
    };
  }

  const auth = loadAuthService(config);
  const pairing = auth.getPairingStatus();
  return {
    running: false,
    reachable: false,
    pid: live?.startingPid ?? null,
    host: live?.manifest?.host ?? config.host,
    port: live?.manifest?.port ?? config.port,
    bridgeUrl: live?.manifest?.bridgeUrl ?? config.bridgeUrl,
    startedAt: live?.manifest?.startedAt ?? null,
    pairingRequired: pairing.pairingRequired,
    pairingExpiresAt: pairing.expiresAt,
    configPath: config.configPath,
    statePath: config.authStatePath,
    projectStatePath: config.projectStatePath,
    logPath: config.logPath,
    runtimeManifestPath: config.runtimeManifestPath,
    version: null,
    message: live?.manifest
      ? 'Bridge daemon is not running'
      : 'Bridge daemon is not running',
  };
}

async function buildStatusFromLiveRuntime(
  config: BridgeServerConfig,
  manifest: BridgeRuntimeManifest | null,
): Promise<BridgeDaemonStatusResponse> {
  if (!manifest) {
    return getDaemonStatus(config);
  }

  return {
    running: true,
    reachable: true,
    pid: manifest.pid,
    host: manifest.host,
    port: manifest.port,
    bridgeUrl: manifest.bridgeUrl,
    startedAt: manifest.startedAt,
    pairingRequired: true,
    pairingExpiresAt: null,
    configPath: manifest.configPath,
    statePath: manifest.statePath,
    projectStatePath: manifest.projectStatePath,
    logPath: manifest.logPath,
    runtimeManifestPath: config.runtimeManifestPath,
    version: {
      bridgePackageVersion: manifest.bridgePackageVersion,
      bridgeProtocolVersion: manifest.bridgeProtocolVersion,
    },
  };
}

function createRunningStatusFromConfig(
  config: BridgeServerConfig,
  pid: number | null,
): BridgeDaemonStatusResponse {
  return {
    running: true,
    reachable: true,
    pid,
    host: config.host,
    port: config.port,
    bridgeUrl: config.bridgeUrl,
    startedAt: Date.now(),
    pairingRequired: true,
    pairingExpiresAt: null,
    configPath: config.configPath,
    statePath: config.authStatePath,
    projectStatePath: config.projectStatePath,
    logPath: config.logPath,
    runtimeManifestPath: config.runtimeManifestPath,
    version: {
      bridgePackageVersion: BRIDGE_PACKAGE_VERSION,
      bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
    },
  };
}

async function printStartOutput(
  config: BridgeServerConfig,
  status: BridgeDaemonStatusResponse,
  json: boolean,
): Promise<void> {
  const bridgeUrl = status.bridgeUrl ?? config.bridgeUrl;
  const pairing = await getPairingStatusForDisplay(config);
  if (json) {
    printJson({
      status,
      pairing: {
        pairingRequired: pairing.pairingRequired,
        instructions: pairing.instructions,
        expiresAt: pairing.expiresAt,
        pairingCode: pairing.pairingCode,
        bridgeUrl,
        qrPayload: createPairingPayload(bridgeUrl, pairing.pairingCode),
      },
    });
    return;
  }

  console.log(`Bridge listening on ${status.bridgeUrl ?? config.bridgeUrl}`);
  console.log(`Bridge config path: ${status.configPath}`);
  console.log(`Bridge auth state path: ${status.statePath}`);
  console.log(`Bridge project state path: ${status.projectStatePath}`);
  console.log(`Bridge log path: ${status.logPath}`);
  renderPairingStatus(pairing, bridgeUrl);
}

function printStatus(status: BridgeDaemonStatusResponse): void {
  console.log(`Running: ${status.running ? 'yes' : 'no'}`);
  console.log(`Reachable: ${status.reachable ? 'yes' : 'no'}`);
  if (status.pid !== null) {
    console.log(`PID: ${status.pid}`);
  }
  if (status.bridgeUrl) {
    console.log(`Bridge URL: ${status.bridgeUrl}`);
  }
  if (status.host && status.port !== null) {
    console.log(`Listening: ${status.host}:${status.port}`);
  }
  if (status.pairingRequired !== null) {
    console.log(`Pairing required: ${status.pairingRequired ? 'yes' : 'no'}`);
  }
  if (status.pairingExpiresAt !== null) {
    console.log(
      `Pairing expires at: ${new Date(status.pairingExpiresAt * 1000).toISOString()}`,
    );
  }
  if (status.version) {
    console.log(`Bridge version: ${status.version.bridgePackageVersion}`);
    console.log(`Bridge protocol: ${status.version.bridgeProtocolVersion}`);
  }
  if (status.message) {
    console.log(`Message: ${status.message}`);
  }
  console.log(`Config path: ${status.configPath}`);
  console.log(`State path: ${status.statePath}`);
  console.log(`Project state path: ${status.projectStatePath}`);
  console.log(`Log path: ${status.logPath}`);
}

function printProjectList(
  projects: Array<{ path: string; importedAt: number; updatedAt: number }>,
): void {
  if (projects.length === 0) {
    console.log('No projects imported.');
    return;
  }

  for (const project of projects) {
    console.log(`${project.path}`);
    console.log(
      `  importedAt: ${new Date(project.importedAt * 1000).toISOString()}`,
    );
    console.log(
      `  updatedAt: ${new Date(project.updatedAt * 1000).toISOString()}`,
    );
  }
}

function printDeviceList(devices: DeviceTrustRecord[]): void {
  if (devices.length === 0) {
    console.log('No trusted devices.');
    return;
  }

  for (const device of devices) {
    console.log(`${device.label} (${device.deviceId})`);
    console.log(`  platform: ${device.platform}`);
    console.log(
      `  createdAt: ${new Date(device.createdAt * 1000).toISOString()}`,
    );
    console.log(
      `  lastSeenAt: ${new Date(device.lastSeenAt * 1000).toISOString()}`,
    );
    if (device.revokedAt !== undefined) {
      console.log(
        `  revokedAt: ${new Date(device.revokedAt * 1000).toISOString()}`,
      );
    }
  }
}

function printKeyValues(value: unknown, indent = 0): void {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    for (const entry of value) {
      console.log(`${prefix}- ${entry}`);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (Array.isArray(entry) || (entry && typeof entry === 'object')) {
        console.log(`${prefix}${key}:`);
        printKeyValues(entry, indent + 2);
      } else {
        console.log(`${prefix}${key}: ${String(entry)}`);
      }
    }
    return;
  }

  console.log(`${prefix}${String(value)}`);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printJsonOrHuman(
  json: boolean,
  value: unknown,
  humanMessage: string,
): void {
  if (json) {
    printJson(value);
    return;
  }

  console.log(humanMessage);
}

function configToJson(config: BridgeServerConfig): Record<string, unknown> {
  return {
    runtimeRoot: config.runtimeRoot,
    configPath: config.configPath,
    runtimeManifestPath: config.runtimeManifestPath,
    runtimeLockPath: config.runtimeLockPath,
    host: config.host,
    port: config.port,
    bridgeUrl: config.bridgeUrl,
    corsOrigins: config.corsOrigins,
    threadUnsubscribeGraceMs: config.threadUnsubscribeGraceMs,
    statePath: config.authStatePath,
    projectStatePath: config.projectStatePath,
    logPath: config.logPath,
  };
}

const COMMAND_HELP: Array<{
  group: string;
  entries: Array<{ command: string; description: string }>;
}> = [
  {
    group: 'Daemon',
    entries: [
      {
        command: 'start',
        description: 'Start the bridge daemon in the background',
      },
      {
        command: 'run',
        description: 'Run the bridge daemon in the foreground',
      },
      { command: 'stop', description: 'Stop the running bridge daemon' },
      { command: 'restart', description: 'Restart the bridge daemon' },
      {
        command: 'status',
        description: 'Show daemon status and connection info',
      },
      { command: 'logs', description: 'Show daemon logs (--follow to tail)' },
    ],
  },
  {
    group: 'Pairing',
    entries: [
      { command: 'pair show', description: 'Show pairing QR code and status' },
      { command: 'pair refresh', description: 'Generate a new pairing code' },
    ],
  },
  {
    group: 'Devices',
    entries: [
      { command: 'devices list', description: 'List all trusted devices' },
      {
        command: 'devices revoke <id>',
        description: 'Revoke access for a device',
      },
      { command: 'devices delete <id>', description: 'Remove a device record' },
    ],
  },
  {
    group: 'Configuration',
    entries: [
      { command: 'config show', description: 'Display current configuration' },
      { command: 'config get <key>', description: 'Get a single config value' },
      {
        command: 'config set <key> <value>',
        description: 'Set a config value',
      },
      { command: 'config edit', description: 'Open config file in $EDITOR' },
      { command: 'config reset', description: 'Reset config to defaults' },
    ],
  },
  {
    group: 'Projects',
    entries: [
      { command: 'projects list', description: 'List imported projects' },
      {
        command: 'projects import <path>',
        description: 'Import a project directory',
      },
      {
        command: 'projects remove <path>',
        description: 'Remove an imported project',
      },
    ],
  },
  {
    group: 'Utilities',
    entries: [
      {
        command: 'doctor',
        description: 'Run diagnostics and check prerequisites',
      },
      { command: 'version', description: 'Print version information' },
      { command: 'completion', description: 'Output shell completion script' },
    ],
  },
];

function printHelp(): void {
  console.log('Usage: codexb <command> [options]');
  console.log('');

  const maxCommandLen = Math.max(
    ...COMMAND_HELP.flatMap((g) => g.entries.map((e) => e.command.length)),
  );

  for (const group of COMMAND_HELP) {
    console.log(`${group.group}:`);
    for (const entry of group.entries) {
      const paddedCommand = entry.command.padEnd(maxCommandLen + 2);
      console.log(`  ${paddedCommand}${entry.description}`);
    }
    console.log('');
  }

  console.log('Flags:');
  console.log('  --json                                Output as JSON');
  console.log('  --runtime-root <path>                 Runtime data directory');
  console.log(
    '  --host <host>                         Bind host (default: 0.0.0.0)',
  );
  console.log(
    '  --port <port>                         Bind port (default: 8787)',
  );
  console.log('  --bridge-url <url>                    Override bridge URL');
  console.log(
    '  --cors-origin <origin>                Allowed CORS origin (repeatable)',
  );
  console.log(
    '  --thread-unsubscribe-grace-ms <ms>    Grace period for thread cleanup',
  );
  console.log(
    '  --tail <n>                            Lines to show (logs command)',
  );
  console.log('  --follow                              Tail logs in real time');
  console.log(
    '  --shell <shell>                       Target shell (completion command)',
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: CliFlags = {
    json: false,
    help: false,
    daemonized: false,
    follow: false,
  };
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case '--json':
      case '-j':
        flags.json = true;
        continue;
      case '--help':
      case '-h':
        flags.help = true;
        continue;
      case '--daemonized':
        flags.daemonized = true;
        continue;
      case '--follow':
        flags.follow = true;
        continue;
      case '--host':
        flags.host = requireValue(argv, ++index, '--host');
        continue;
      case '--port':
        flags.port = normalizePositiveInt(
          requireValue(argv, ++index, '--port'),
        );
        continue;
      case '--bridge-url':
        flags.bridgeUrl = requireValue(argv, ++index, '--bridge-url');
        continue;
      case '--runtime-root':
        flags.runtimeRoot = requireValue(argv, ++index, '--runtime-root');
        continue;
      case '--state-path':
        flags.statePath = requireValue(argv, ++index, '--state-path');
        continue;
      case '--project-state-path':
        flags.projectStatePath = requireValue(
          argv,
          ++index,
          '--project-state-path',
        );
        continue;
      case '--log-path':
        flags.logPath = requireValue(argv, ++index, '--log-path');
        continue;
      case '--cors-origin':
        flags.corsOrigins = [
          ...(flags.corsOrigins ?? []),
          requireValue(argv, ++index, '--cors-origin'),
        ];
        continue;
      case '--cors-origins':
        flags.corsOrigins = [
          ...(flags.corsOrigins ?? []),
          ...requireValue(argv, ++index, '--cors-origins')
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
        ];
        continue;
      case '--thread-unsubscribe-grace-ms':
        flags.threadUnsubscribeGraceMs = normalizePositiveInt(
          requireValue(argv, ++index, '--thread-unsubscribe-grace-ms'),
        );
        continue;
      case '--tail':
        flags.tail = normalizePositiveInt(
          requireValue(argv, ++index, '--tail'),
        );
        continue;
      case '--shell':
        flags.shell = requireValue(argv, ++index, '--shell');
        continue;
      default:
        if (arg.startsWith('--host=')) {
          flags.host = arg.slice('--host='.length);
          continue;
        }
        if (arg.startsWith('--port=')) {
          flags.port = normalizePositiveInt(arg.slice('--port='.length));
          continue;
        }
        if (arg.startsWith('--bridge-url=')) {
          flags.bridgeUrl = arg.slice('--bridge-url='.length);
          continue;
        }
        if (arg.startsWith('--runtime-root=')) {
          flags.runtimeRoot = arg.slice('--runtime-root='.length);
          continue;
        }
        if (arg.startsWith('--state-path=')) {
          flags.statePath = arg.slice('--state-path='.length);
          continue;
        }
        if (arg.startsWith('--project-state-path=')) {
          flags.projectStatePath = arg.slice('--project-state-path='.length);
          continue;
        }
        if (arg.startsWith('--log-path=')) {
          flags.logPath = arg.slice('--log-path='.length);
          continue;
        }
        if (arg.startsWith('--cors-origin=')) {
          flags.corsOrigins = [
            ...(flags.corsOrigins ?? []),
            arg.slice('--cors-origin='.length),
          ];
          continue;
        }
        if (arg.startsWith('--cors-origins=')) {
          flags.corsOrigins = [
            ...(flags.corsOrigins ?? []),
            ...arg
              .slice('--cors-origins='.length)
              .split(',')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0),
          ];
          continue;
        }
        if (arg.startsWith('--thread-unsubscribe-grace-ms=')) {
          flags.threadUnsubscribeGraceMs = normalizePositiveInt(
            arg.slice('--thread-unsubscribe-grace-ms='.length),
          );
          continue;
        }
        if (arg.startsWith('--tail=')) {
          flags.tail = normalizePositiveInt(arg.slice('--tail='.length));
          continue;
        }
        if (arg.startsWith('--shell=')) {
          flags.shell = arg.slice('--shell='.length);
          continue;
        }
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        positionals.push(arg);
    }
  }

  return { flags, positionals };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function normalizePositiveInt(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return Math.trunc(parsed);
}

function normalizeTailCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_LOG_TAIL_LINES;
  }
  return Math.max(1, Math.trunc(value));
}

function toConfigOverrides(flags: CliFlags): BridgeConfigOverrides {
  const overrides: BridgeConfigOverrides = {};
  if (flags.runtimeRoot !== undefined) {
    overrides.runtimeRoot = flags.runtimeRoot;
  }
  if (flags.host !== undefined) {
    overrides.host = flags.host;
  }
  if (flags.port !== undefined) {
    overrides.port = flags.port;
  }
  if (flags.bridgeUrl !== undefined) {
    overrides.bridgeUrl = flags.bridgeUrl;
  }
  if (flags.corsOrigins !== undefined) {
    overrides.corsOrigins = flags.corsOrigins;
  }
  if (flags.threadUnsubscribeGraceMs !== undefined) {
    overrides.threadUnsubscribeGraceMs = flags.threadUnsubscribeGraceMs;
  }
  if (flags.statePath !== undefined) {
    overrides.statePath = flags.statePath;
  }
  if (flags.projectStatePath !== undefined) {
    overrides.projectStatePath = flags.projectStatePath;
  }
  if (flags.logPath !== undefined) {
    overrides.logPath = flags.logPath;
  }
  return overrides;
}

function serializeConfigArgs(flags: CliFlags): string[] {
  const args: string[] = [];
  appendConfigArg(args, '--runtime-root', flags.runtimeRoot);
  appendConfigArg(args, '--host', flags.host);
  appendConfigArg(args, '--port', flags.port);
  appendConfigArg(args, '--bridge-url', flags.bridgeUrl);
  appendConfigArgList(args, '--cors-origin', flags.corsOrigins);
  appendConfigArg(
    args,
    '--thread-unsubscribe-grace-ms',
    flags.threadUnsubscribeGraceMs,
  );
  appendConfigArg(args, '--state-path', flags.statePath);
  appendConfigArg(args, '--project-state-path', flags.projectStatePath);
  appendConfigArg(args, '--log-path', flags.logPath);
  return args;
}

function appendConfigArg(
  args: string[],
  flag: string,
  value: string | number | undefined,
): void {
  if (value === undefined) {
    return;
  }
  args.push(flag, String(value));
}

function appendConfigArgList(
  args: string[],
  flag: string,
  values: string[] | undefined,
): void {
  if (!values || values.length === 0) {
    return;
  }
  for (const value of values) {
    args.push(flag, value);
  }
}

function loadAuthService(config: BridgeServerConfig): BridgeAuthService {
  return new BridgeAuthService(new DeviceTrustStore(config.authStatePath));
}

async function getPairingStatusForDisplay(
  config: BridgeServerConfig,
  options: {
    strictLiveDaemon?: boolean;
  } = {},
): Promise<PairingStatusResponse & { regenerated?: boolean }> {
  const live = getLiveRuntime(config);
  if (live.live) {
    try {
      return await fetchJson<PairingStatusResponse>(
        new URL('/api/pairing', live.live.bridgeUrl).toString(),
      );
    } catch (error) {
      if (options.strictLiveDaemon) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Unable to read pairing status from running bridge at ${live.live.bridgeUrl}: ${message}`,
        );
      }

      return loadAuthService(config).getPairingStatus();
    }
  }

  return loadAuthService(config).getPairingStatus();
}

function loadProjectStore(config: BridgeServerConfig): ProjectRegistryStore {
  return new ProjectRegistryStore(config.projectStatePath);
}

function readLiveManifest(
  config: BridgeServerConfig,
): BridgeRuntimeManifest | null {
  const manifest = readSafeBridgeRuntimeManifest(config.runtimeManifestPath);
  if (!manifest) {
    return null;
  }
  if (!isProcessRunning(manifest.pid)) {
    return null;
  }
  return manifest;
}

function getLiveRuntime(config: BridgeServerConfig): LiveRuntimeState {
  const manifest = readSafeBridgeRuntimeManifest(config.runtimeManifestPath);
  const lock = readSafeBridgeRuntimeLock(config.runtimeLockPath);
  const live = manifest && isProcessRunning(manifest.pid) ? manifest : null;
  const startingPid =
    !live && lock && isProcessRunning(lock.pid) ? lock.pid : null;
  return { manifest, lock, live, startingPid };
}

function readLiveRuntime(config: BridgeServerConfig): LiveRuntimeState {
  return getLiveRuntime(config);
}

function readSafeBridgeRuntimeManifest(
  manifestPath: string,
): BridgeRuntimeManifest | null {
  try {
    return readBridgeRuntimeManifest(manifestPath);
  } catch {
    return null;
  }
}

function readSafeBridgeRuntimeLock(
  lockPath: string,
): { pid: number; acquiredAt: number } | null {
  try {
    return readBridgeRuntimeLock(lockPath);
  } catch {
    return null;
  }
}

function removeStaleRuntimeArtifacts(config: BridgeServerConfig): void {
  if (existsSync(config.runtimeManifestPath)) {
    try {
      unlinkSync(config.runtimeManifestPath);
    } catch {
      // Ignore stale manifest cleanup errors.
    }
  }
}

async function waitForDaemonReady(
  config: BridgeServerConfig,
  pid: number | null,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (pid !== null && !isProcessRunning(pid)) {
      throw new Error('Bridge daemon exited before becoming ready');
    }

    try {
      const response = await fetch(new URL('/healthz', config.bridgeUrl));
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }

    await delay(LOG_POLL_INTERVAL_MS / 4);
  }

  throw new Error(`Timed out waiting for bridge daemon at ${config.bridgeUrl}`);
}

async function waitForDaemonExit(
  config: BridgeServerConfig,
  pid: number,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STOP_TIMEOUT_MS) {
    if (!isProcessRunning(pid)) {
      return;
    }
    await delay(LOG_POLL_INTERVAL_MS / 4);
  }

  removeStaleRuntimeArtifacts(config);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

async function readLogTail(logPath: string, lines: number): Promise<string> {
  const raw = readFileSync(logPath, 'utf8');
  const content = raw.trimEnd();
  if (content.length === 0) {
    return '';
  }

  return content.split(/\r?\n/).slice(-lines).join('\n');
}

async function followLogFile(logPath: string, lines: number): Promise<void> {
  let lastLength = 0;
  let lastPrinted = await readLogTail(logPath, lines);
  if (lastPrinted.length > 0) {
    console.log(lastPrinted);
  }
  lastLength = statSync(logPath).size;

  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopped) {
    await delay(LOG_POLL_INTERVAL_MS);
    if (!existsSync(logPath)) {
      continue;
    }
    const nextLength = statSync(logPath).size;
    if (nextLength <= lastLength) {
      continue;
    }

    const raw = readFileSync(logPath, 'utf8');
    const appended = raw.slice(lastLength);
    lastLength = nextLength;
    if (appended.length > 0) {
      process.stdout.write(appended);
      lastPrinted = appended;
    }
  }

  if (lastPrinted.length === 0) {
    return;
  }
}

async function canBindPort(
  host: string,
  port: number,
): Promise<{ ok: boolean; message: string }> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => {
      resolve({
        ok: false,
        message: `Port ${host}:${port} is already in use`,
      });
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolve({
          ok: true,
          message: `Port ${host}:${port} is available`,
        });
      });
    });
  });
}

async function checkCodexAvailability(): Promise<DoctorCheck> {
  return new Promise((resolve) => {
    const child = spawn('codex', ['app-server', '--help'], {
      stdio: 'ignore',
    });
    child.once('error', () => {
      resolve({
        name: 'codex',
        ok: false,
        message: 'codex app-server is not available on PATH',
      });
    });
    child.once('exit', (code) => {
      resolve({
        name: 'codex',
        ok: code === 0,
        message:
          code === 0
            ? 'codex app-server is available'
            : 'codex app-server exited with a non-zero status',
      });
    });
  });
}

function resolveShellName(shell: string): string {
  return shell.includes('/') ? path.basename(shell) : shell;
}

function normalizeShell(shell: string | undefined): string {
  if (!shell) {
    return 'bash';
  }

  const normalized = resolveShellName(shell.toLowerCase());
  if (normalized.includes('zsh')) return 'zsh';
  if (normalized.includes('fish')) return 'fish';
  if (normalized.includes('bash')) return 'bash';
  if (normalized.includes('powershell') || normalized.includes('pwsh')) {
    return 'powershell';
  }
  return 'bash';
}

function generateCompletionScript(shell: string): string {
  const commandTree = [
    'start',
    'run',
    'stop',
    'restart',
    'status',
    'logs',
    'doctor',
    'version',
    'pair show',
    'pair refresh',
    'devices list',
    'devices revoke',
    'devices delete',
    'config show',
    'config get',
    'config set',
    'config edit',
    'config reset',
    'projects list',
    'projects import',
    'projects remove',
    'completion',
  ].join(' ');

  switch (shell) {
    case 'zsh':
      return `#compdef codexb\n_arguments '*: :(${commandTree})'`;
    case 'fish':
      return `complete -c codexb -f -a "${commandTree}"`;
    case 'powershell':
      return `Register-ArgumentCompleter -CommandName codexb -ScriptBlock { param($wordToComplete) ${commandTree
        .split(' ')
        .map((command) => `'${command}'`)
        .join(', ')} | Where-Object { $_ -like "$wordToComplete*" } }`;
    default:
      return `complete -W "${commandTree}" codexb`;
  }
}

function loadConfigFilePath(config: BridgeServerConfig): string {
  return config.configPath;
}

async function openInEditor(filePath: string): Promise<void> {
  const editor =
    process.env.VISUAL ??
    process.env.EDITOR ??
    (process.platform === 'win32' ? 'notepad' : 'vi');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [filePath], {
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${editor} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function resolveImportProjectPath(inputPath: string): Promise<string> {
  const normalizedPath = normalizeAbsolutePath(inputPath, true);
  if (!normalizedPath) {
    throw new Error('Project path is required');
  }

  const fsPath = await import('node:fs/promises');
  const resolvedPath = await fsPath
    .realpath(normalizedPath)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new Error('Project path does not exist');
      }
      throw new Error('Unable to resolve project path');
    });
  const resolvedStats = await fsPath.stat(resolvedPath).catch(() => {
    throw new Error('Unable to read project path');
  });

  if (!resolvedStats.isDirectory()) {
    throw new Error('Project path must be a directory');
  }

  return resolvedPath;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
}

function loadProjectStoreWithReload(
  config: BridgeServerConfig,
): ProjectRegistryStore {
  const store = loadProjectStore(config);
  store.reload();
  return store;
}

if (isCurrentModuleEntryPoint()) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

function isCurrentModuleEntryPoint(): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entryPoint)
    );
  } catch {
    return false;
  }
}
