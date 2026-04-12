/**
 * Auto-detect device info from the browser's User-Agent string.
 * Replaces the manual device label / platform / device ID fields.
 */

function randomUUIDFallback(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6]! = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8]! = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function detectDeviceInfo(): {
  label: string;
  platform: string;
  deviceId: string;
} {
  const ua = navigator.userAgent;

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMac = /Mac/i.test(ua);
  const isWindows = /Windows/i.test(ua);

  let platform: string;
  let browser: string;

  if (isIOS) {
    platform = "ios";
    browser = ua.includes("CriOS") ? "chrome" : "safari";
  } else if (isAndroid) {
    platform = "android";
    browser = ua.includes("Chrome") ? "chrome" : "browser";
  } else if (isMac) {
    platform = "macos";
    browser = ua.includes("Chrome")
      ? "chrome"
      : ua.includes("Firefox")
        ? "firefox"
        : "safari";
  } else if (isWindows) {
    platform = "windows";
    browser = ua.includes("Chrome")
      ? "chrome"
      : ua.includes("Firefox")
        ? "firefox"
        : "edge";
  } else {
    platform = "linux";
    browser = "browser";
  }

  const label = `${platform} ${browser}`;
  const deviceId = crypto.randomUUID?.() ?? randomUUIDFallback();

  return { label, platform: `${platform}-${browser}`, deviceId };
}
