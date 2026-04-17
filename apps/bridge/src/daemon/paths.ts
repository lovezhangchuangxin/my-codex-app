import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BridgeRuntimePaths {
  runtimeRoot: string;
  configPath: string;
  authStatePath: string;
  projectStatePath: string;
  logDir: string;
  logPath: string;
  runtimeManifestPath: string;
  runtimeLockPath: string;
}

export function resolveBridgeRuntimeRoot(): string {
  return join(homedir(), '.my-codex-app', 'bridge');
}

export function resolveBridgeRuntimePaths(
  runtimeRoot = resolveBridgeRuntimeRoot(),
): BridgeRuntimePaths {
  return {
    runtimeRoot,
    configPath: join(runtimeRoot, 'config.json'),
    authStatePath: join(runtimeRoot, 'bridge-auth-state.json'),
    projectStatePath: join(runtimeRoot, 'bridge-project-state.json'),
    logDir: join(runtimeRoot, 'logs'),
    logPath: join(runtimeRoot, 'logs', 'bridge.log'),
    runtimeManifestPath: join(runtimeRoot, 'runtime.json'),
    runtimeLockPath: join(runtimeRoot, 'runtime.lock'),
  };
}

export function ensureBridgeRuntimeDirectories(
  paths: BridgeRuntimePaths,
): void {
  mkdirSync(paths.runtimeRoot, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
}
