import { spawn, type SpawnOptions } from 'node:child_process';

export function resolveCurrentExecutable(): string {
  return process.execPath;
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ESRCH'
    ) {
      return false;
    }
    return false;
  }
}

export function terminateProcess(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
): void {
  process.kill(pid, signal);
}

export function spawnDetachedProcess(
  entryFile: string,
  args: string[],
  options?: SpawnOptions,
): ReturnType<typeof spawn> {
  return spawn(resolveCurrentExecutable(), [entryFile, ...args], {
    detached: true,
    stdio: 'ignore',
    ...options,
  });
}
