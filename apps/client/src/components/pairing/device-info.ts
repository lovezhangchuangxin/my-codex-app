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

  const isIPhone = /iPhone/i.test(ua);
  const isIPad = /iPad/i.test(ua);
  const isIOS = isIPhone || isIPad || /iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMac = /Mac/i.test(ua);
  const isWindows = /Windows/i.test(ua);

  let platform: string;
  let browser: string;
  let label: string;

  if (isIOS) {
    platform = "ios";
    browser = ua.includes("CriOS") ? "chrome" : "safari";
    label = `${isIPhone ? "iPhone" : isIPad ? "iPad" : "iOS"} ${toBrowserLabel(browser)}`;
  } else if (isAndroid) {
    platform = "android";
    browser = ua.includes("Chrome") ? "chrome" : "browser";
    label = `Android ${toBrowserLabel(browser)}`;
  } else if (isMac) {
    platform = "macos";
    browser = ua.includes("Chrome")
      ? "chrome"
      : ua.includes("Firefox")
        ? "firefox"
        : "safari";
    label = `macOS ${toBrowserLabel(browser)}`;
  } else if (isWindows) {
    platform = "windows";
    browser = ua.includes("Chrome")
      ? "chrome"
      : ua.includes("Firefox")
        ? "firefox"
        : "edge";
    label = `Windows ${toBrowserLabel(browser)}`;
  } else {
    platform = "linux";
    browser = "browser";
    label = `Linux ${toBrowserLabel(browser)}`;
  }

  const deviceId = crypto.randomUUID?.() ?? randomUUIDFallback();

  return { label, platform: `${platform}-${browser}`, deviceId };
}

function toBrowserLabel(browser: string) {
  switch (browser) {
    case "chrome":
      return "Chrome";
    case "safari":
      return "Safari";
    case "firefox":
      return "Firefox";
    case "edge":
      return "Edge";
    default:
      return "Browser";
  }
}
