export const appViewportHeight = 'var(--app-viewport-height, 100svh)';
export const appViewportDynamicHeight = 'var(--app-viewport-height, 100dvh)';
export const appViewportOffsetTop = 'var(--app-viewport-offset-top, 0px)';
export const appKeyboardInsetHeight = 'var(--app-keyboard-inset-height, 0px)';
export const tauriKeyboardInsetChangeEvent = 'tauri-keyboard-inset-change';

let nativeKeyboardInsetHeight = 0;

export function isTextEntryElement(
  element: EventTarget | null,
): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.matches(
      [
        'input',
        'textarea',
        'select',
        '[contenteditable=""]',
        '[contenteditable="true"]',
        '[contenteditable="plaintext-only"]',
      ].join(', '),
    )
  );
}

export function readNativeKeyboardInsetHeight() {
  return nativeKeyboardInsetHeight;
}

export function convertNativePixelsToCssPixels(value: number) {
  if (typeof window === 'undefined') {
    return Math.max(0, Math.round(value));
  }

  const devicePixelRatio =
    Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;

  return Math.max(0, Math.round(value / devicePixelRatio));
}

export function writeNativeKeyboardInsetHeight(value: number) {
  nativeKeyboardInsetHeight = convertNativePixelsToCssPixels(value);
}
