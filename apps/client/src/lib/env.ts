const BRIDGE_PORT = 8787;

// 使用当前页面 hostname 替代硬编码 127.0.0.1，
// 这样通过局域网 IP 访问时 client 自动指向同一台电脑的 bridge 服务。
function resolveBridgeBaseUrl(): string {
  const candidate = import.meta.env.VITE_BRIDGE_BASE_URL?.trim();
  if (candidate) {
    try {
      return new URL(candidate).toString();
    } catch {
      // fall through to default
    }
  }
  return `http://${window.location.hostname}:${BRIDGE_PORT}`;
}

export const bridgeBaseUrl = resolveBridgeBaseUrl();
export const bridgeHealthUrl = new URL('/healthz', bridgeBaseUrl).toString();
export const connectionModeLabel = 'Local';
