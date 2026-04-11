import type { BridgeCredentialStore, BridgeSessionCredentials } from "@my-codex-app/sdk";

const STORAGE_KEY = "my-codex-app.bridge-session";

export class BrowserBridgeCredentialStore implements BridgeCredentialStore {
  clear(): void {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  load(): BridgeSessionCredentials | null {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as BridgeSessionCredentials;
    } catch {
      this.clear();
      return null;
    }
  }

  save(credentials: BridgeSessionCredentials): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  }
}

export function createDefaultDeviceDraft(): {
  deviceId: string;
  label: string;
  platform: string;
} {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "browser";
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return {
    deviceId: window.crypto.randomUUID(),
    label: isMobile ? "Mobile browser" : "Browser",
    platform
  };
}
