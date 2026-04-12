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

// crypto.randomUUID() is only available in secure contexts (HTTPS / localhost),
// not available when accessing via HTTP LAN IP, fall back to getRandomValues.
function randomUUIDFallback(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6]! = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8]! = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
    deviceId: crypto.randomUUID?.() ?? randomUUIDFallback(),
    label: isMobile ? "Mobile Browser" : "Browser",
    platform
  };
}
