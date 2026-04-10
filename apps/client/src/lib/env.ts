const DEFAULT_BRIDGE_BASE_URL = "http://127.0.0.1:8787";

function resolveBridgeBaseUrl(): string {
  const candidate = import.meta.env.VITE_BRIDGE_BASE_URL?.trim() || DEFAULT_BRIDGE_BASE_URL;

  try {
    return new URL(candidate).toString();
  } catch {
    return DEFAULT_BRIDGE_BASE_URL;
  }
}

export const bridgeBaseUrl = resolveBridgeBaseUrl();
export const bridgeAccessToken = import.meta.env.VITE_BRIDGE_ACCESS_TOKEN?.trim() || "";
export const bridgeHealthUrl = new URL("/healthz", bridgeBaseUrl).toString();
export const connectionModeLabel = "Local";
