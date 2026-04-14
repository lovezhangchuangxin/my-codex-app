export type HostRuntime = 'web' | 'tauri';

function resolveHostRuntime(): HostRuntime {
  const candidate = import.meta.env.VITE_HOST_RUNTIME?.trim().toLowerCase();
  return candidate === 'tauri' ? 'tauri' : 'web';
}

export const hostRuntime = resolveHostRuntime();
export const isTauriHost = hostRuntime === 'tauri';
export const supportsPwa = hostRuntime === 'web';
