import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

import {
  ensureBridgeRuntimeDirectories,
  resolveBridgeRuntimePaths,
  type BridgeRuntimePaths,
} from '../daemon/paths.js';
import { resolveBridgeQrUrl } from './logging.js';

export interface BridgeConfigFile {
  version: 1;
  host?: string;
  port?: number;
  bridgeUrl?: string;
  corsOrigins?: string[];
  threadUnsubscribeGraceMs?: number;
  statePath?: string;
  projectStatePath?: string;
  logPath?: string;
}

export interface BridgeConfigOverrides {
  runtimeRoot?: string;
  host?: string;
  port?: number;
  bridgeUrl?: string;
  corsOrigins?: string[];
  threadUnsubscribeGraceMs?: number;
  statePath?: string;
  projectStatePath?: string;
  logPath?: string;
}

export interface BridgeServerConfig extends BridgeRuntimePaths {
  host: string;
  port: number;
  bridgeUrl: string;
  corsOrigins: string[];
  threadUnsubscribeGraceMs: number;
}

export function loadBridgeServerConfig(
  overrides: BridgeConfigOverrides = {},
): BridgeServerConfig {
  const runtimeRoot = normalizeRuntimeRoot(overrides.runtimeRoot);
  const runtimePaths = resolveBridgeRuntimePaths(runtimeRoot);
  ensureBridgeRuntimeDirectories(runtimePaths);

  const fileConfig = readBridgeConfigFile(runtimePaths.configPath);
  const envConfig = readEnvironmentBridgeConfig();

  const host =
    overrides.host ?? fileConfig?.host ?? envConfig.host ?? '0.0.0.0';
  const port =
    normalizePort(overrides.port) ??
    normalizePort(fileConfig?.port) ??
    normalizePort(envConfig.port) ??
    8787;
  const bridgeUrl =
    normalizeText(overrides.bridgeUrl) ??
    normalizeText(fileConfig?.bridgeUrl) ??
    normalizeText(envConfig.bridgeUrl) ??
    resolveBridgeQrUrl(host, port);
  const corsOrigins = normalizeCorsOrigins(
    overrides.corsOrigins ?? fileConfig?.corsOrigins ?? envConfig.corsOrigins,
  );
  const threadUnsubscribeGraceMs =
    normalizePort(overrides.threadUnsubscribeGraceMs) ??
    normalizePort(fileConfig?.threadUnsubscribeGraceMs) ??
    normalizePort(envConfig.threadUnsubscribeGraceMs) ??
    5_000;
  const statePath = normalizePathOverride(
    overrides.statePath ??
      fileConfig?.statePath ??
      envConfig.statePath ??
      runtimePaths.authStatePath,
    runtimePaths.runtimeRoot,
  );
  const projectStatePath = normalizePathOverride(
    overrides.projectStatePath ??
      fileConfig?.projectStatePath ??
      envConfig.projectStatePath ??
      runtimePaths.projectStatePath,
    runtimePaths.runtimeRoot,
  );
  const logPath = normalizePathOverride(
    overrides.logPath ??
      fileConfig?.logPath ??
      envConfig.logPath ??
      runtimePaths.logPath,
    runtimePaths.runtimeRoot,
  );
  mkdirSync(resolve(logPath, '..'), { recursive: true });

  return {
    ...runtimePaths,
    authStatePath: statePath,
    projectStatePath,
    logPath,
    host,
    port,
    bridgeUrl,
    corsOrigins,
    threadUnsubscribeGraceMs,
  };
}

export function readBridgeConfigFile(
  configPath: string,
): BridgeConfigFile | null {
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BridgeConfigFile>;
    if (parsed.version !== 1) {
      throw new Error(`Invalid bridge config version at ${configPath}`);
    }

    return {
      version: 1,
      ...(typeof parsed.host === 'string' ? { host: parsed.host } : {}),
      ...(typeof parsed.port === 'number' ? { port: parsed.port } : {}),
      ...(typeof parsed.bridgeUrl === 'string'
        ? { bridgeUrl: parsed.bridgeUrl }
        : {}),
      ...(Array.isArray(parsed.corsOrigins)
        ? { corsOrigins: parsed.corsOrigins.filter(isNonEmptyString) }
        : {}),
      ...(typeof parsed.threadUnsubscribeGraceMs === 'number'
        ? { threadUnsubscribeGraceMs: parsed.threadUnsubscribeGraceMs }
        : {}),
      ...(typeof parsed.statePath === 'string'
        ? { statePath: parsed.statePath }
        : {}),
      ...(typeof parsed.projectStatePath === 'string'
        ? { projectStatePath: parsed.projectStatePath }
        : {}),
      ...(typeof parsed.logPath === 'string'
        ? { logPath: parsed.logPath }
        : {}),
    };
  } catch (error) {
    if (isFileMissing(error)) {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid bridge config JSON at ${configPath}`);
    }
    throw error;
  }
}

export function writeBridgeConfigFile(
  configPath: string,
  config: BridgeConfigFile,
): void {
  mkdirSync(resolve(configPath, '..'), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function resetBridgeConfigFile(configPath: string): void {
  writeBridgeConfigFile(configPath, { version: 1 });
}

export function updateBridgeConfigFile(
  configPath: string,
  updater: (current: BridgeConfigFile) => BridgeConfigFile,
): BridgeConfigFile {
  const next = updater(readBridgeConfigFile(configPath) ?? { version: 1 });
  writeBridgeConfigFile(configPath, next);
  return next;
}

export function getBridgeConfigValue(
  config: BridgeServerConfig,
  key: BridgeConfigKey,
): string | number | string[] | undefined {
  switch (key) {
    case 'host':
      return config.host;
    case 'port':
      return config.port;
    case 'bridgeUrl':
      return config.bridgeUrl;
    case 'corsOrigins':
      return config.corsOrigins;
    case 'threadUnsubscribeGraceMs':
      return config.threadUnsubscribeGraceMs;
    case 'statePath':
      return config.authStatePath;
    case 'projectStatePath':
      return config.projectStatePath;
    case 'logPath':
      return config.logPath;
    case 'runtimeRoot':
      return config.runtimeRoot;
    case 'configPath':
      return config.configPath;
    case 'runtimeManifestPath':
      return config.runtimeManifestPath;
    case 'runtimeLockPath':
      return config.runtimeLockPath;
    default:
      return undefined;
  }
}

export type BridgeConfigKey =
  | 'host'
  | 'port'
  | 'bridgeUrl'
  | 'corsOrigins'
  | 'threadUnsubscribeGraceMs'
  | 'statePath'
  | 'projectStatePath'
  | 'logPath'
  | 'runtimeRoot'
  | 'configPath'
  | 'runtimeManifestPath'
  | 'runtimeLockPath';

function normalizeRuntimeRoot(value: string | undefined): string {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return resolveBridgeRuntimePaths().runtimeRoot;
  }
  return normalizePathOverride(
    trimmed,
    resolveBridgeRuntimePaths().runtimeRoot,
  );
}

function normalizeCorsOrigins(value: string[] | undefined): string[] {
  if (!value || value.length === 0) {
    return ['*'];
  }

  const normalized = value
    .flatMap((entry) =>
      entry
        .split(',')
        .map((part) => part.trim())
        .filter(isNonEmptyString),
    )
    .filter(isNonEmptyString);

  return normalized.length > 0 ? normalized : ['*'];
}

function normalizePort(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function normalizePathOverride(value: string, runtimeRoot: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return runtimeRoot;
  }

  const expanded = normalized.startsWith('~')
    ? normalized.replace(/^~/, homedir())
    : normalized;

  return isAbsolute(expanded) ? expanded : resolve(runtimeRoot, expanded);
}

function normalizeText(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readEnvironmentBridgeConfig(): Partial<BridgeConfigFile> & {
  statePath?: string;
  projectStatePath?: string;
  logPath?: string;
} {
  const corsOrigins = normalizeCorsEnv(
    process.env.BRIDGE_CORS_ORIGINS ?? process.env.BRIDGE_ORIGIN,
  );
  const bridgePort = toNumber(process.env.BRIDGE_PORT);
  const unsubscribeGraceMs = toNumber(
    process.env.BRIDGE_THREAD_UNSUBSCRIBE_GRACE_MS,
  );
  const config: Partial<BridgeConfigFile> & {
    statePath?: string;
    projectStatePath?: string;
    logPath?: string;
  } = {};

  const host = normalizeText(process.env.BRIDGE_HOST);
  if (host) {
    config.host = host;
  }

  const port = normalizePort(bridgePort);
  if (port !== undefined) {
    config.port = port;
  }

  const bridgeUrl = normalizeText(process.env.BRIDGE_URL);
  if (bridgeUrl) {
    config.bridgeUrl = bridgeUrl;
  }

  if (corsOrigins) {
    config.corsOrigins = corsOrigins;
  }

  const graceMs = normalizePort(unsubscribeGraceMs);
  if (graceMs !== undefined) {
    config.threadUnsubscribeGraceMs = graceMs;
  }

  const statePath = normalizeText(process.env.BRIDGE_STATE_PATH);
  if (statePath) {
    config.statePath = statePath;
  }

  const projectStatePath = normalizeText(process.env.BRIDGE_PROJECT_STATE_PATH);
  if (projectStatePath) {
    config.projectStatePath = projectStatePath;
  }

  const logPath = normalizeText(process.env.BRIDGE_LOG_PATH);
  if (logPath) {
    config.logPath = logPath;
  }

  return config;
}

function normalizeCorsEnv(value: string | undefined): string[] | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }

  return normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter(isNonEmptyString);
}

function isFileMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
