import { isTauriHost } from '@/platform/host';

const BRIDGE_TARGET_STORAGE_KEY = 'my-codex-app.bridge-target';
const BRIDGE_TARGET_CHANGE_EVENT = 'my-codex-app:bridge-target-change';
const BRIDGE_PORT = 8787;
const DEFAULT_LOCALHOST_BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;

export function normalizeBridgeBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function readStoredBridgeBaseUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(BRIDGE_TARGET_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const normalized = normalizeBridgeBaseUrl(raw);
    if (!normalized) {
      window.localStorage.removeItem(BRIDGE_TARGET_STORAGE_KEY);
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export function writeStoredBridgeBaseUrl(raw: string): string {
  const normalized = normalizeBridgeBaseUrl(raw);
  if (!normalized) {
    throw new Error('Invalid bridge URL');
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BRIDGE_TARGET_STORAGE_KEY, normalized);
    window.dispatchEvent(new Event(BRIDGE_TARGET_CHANGE_EVENT));
  }

  return normalized;
}

export function subscribeToBridgeBaseUrlChange(
  listener: () => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === BRIDGE_TARGET_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener(BRIDGE_TARGET_CHANGE_EVENT, listener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(BRIDGE_TARGET_CHANGE_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function resolveBridgeBaseUrl(): string {
  return (
    readStoredBridgeBaseUrl() ??
    resolveEnvBridgeBaseUrl() ??
    resolveBrowserHostBridgeBaseUrl() ??
    DEFAULT_LOCALHOST_BRIDGE_URL
  );
}

export function resolveBridgeTargetInputValue(): string {
  return (
    readStoredBridgeBaseUrl() ??
    resolveEnvBridgeBaseUrl() ??
    (isTauriHost
      ? ''
      : (resolveBrowserHostBridgeBaseUrl() ?? DEFAULT_LOCALHOST_BRIDGE_URL))
  );
}

export function toBridgeHealthUrl(baseUrl: string): string {
  return new URL('/healthz', baseUrl).toString();
}

function resolveEnvBridgeBaseUrl(): string | null {
  const candidate = import.meta.env.VITE_BRIDGE_BASE_URL?.trim();
  if (!candidate) {
    return null;
  }

  return normalizeBridgeBaseUrl(candidate);
}

function resolveBrowserHostBridgeBaseUrl(): string | null {
  if (typeof window === 'undefined' || isTauriHost) {
    return null;
  }

  return normalizeBridgeBaseUrl(
    `http://${window.location.hostname}:${BRIDGE_PORT}`,
  );
}
