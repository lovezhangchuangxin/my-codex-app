import { useEffect, type ReactNode } from 'react';

import { PwaUpdatePrompt } from '@/components/common/pwa-update-prompt';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LocaleProvider } from '@/lib/i18n/provider';
import { LazyRuntimeProvider } from '@/lib/runtime/lazy-runtime-provider';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { isTauriHost, supportsPwa } from '@/platform/host';
import {
  isTextEntryElement,
  readNativeKeyboardInsetHeight,
  tauriKeyboardInsetChangeEvent,
  writeNativeKeyboardInsetHeight,
} from '@/platform/viewport';
import { Toaster } from 'sonner';

const DEV_SERVICE_WORKER_RESET_KEY =
  '__my_codex_app_dev_service_worker_reset__';

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      position="top-center"
      richColors
      theme={theme === 'light' ? 'light' : 'dark'}
      toastOptions={{
        className: 'font-sans',
      }}
    />
  );
}

function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (!supportsPwa || !import.meta.env.DEV || typeof window === 'undefined') {
      return;
    }

    void (async () => {
      try {
        const hadActiveController =
          'serviceWorker' in navigator &&
          navigator.serviceWorker.controller !== null;

        if ('serviceWorker' in navigator) {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) => registration.unregister()),
          );
        }

        if ('caches' in window) {
          const cacheKeys = await window.caches.keys();
          await Promise.all(
            cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)),
          );
        }

        if (
          hadActiveController &&
          window.sessionStorage.getItem(DEV_SERVICE_WORKER_RESET_KEY) !== '1'
        ) {
          window.sessionStorage.setItem(DEV_SERVICE_WORKER_RESET_KEY, '1');
          window.location.reload();
          return;
        }

        window.sessionStorage.removeItem(DEV_SERVICE_WORKER_RESET_KEY);
      } catch {
        // Dev cleanup should never block app startup.
      }
    })();
  }, []);

  return null;
}

function TauriViewportSync() {
  useEffect(() => {
    if (!isTauriHost || typeof window === 'undefined') {
      return;
    }

    const root = document.documentElement;
    let animationFrameId = 0;
    let focusTimeoutId = 0;
    let blurTimeoutId = 0;

    const applyViewportMetrics = () => {
      const viewport = window.visualViewport;
      const nativeKeyboardInset = readNativeKeyboardInsetHeight();
      const viewportHeight = Math.round(viewport?.height ?? window.innerHeight);
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
      const derivedKeyboardInset = Math.max(
        0,
        Math.round(window.innerHeight - viewportHeight - offsetTop),
      );
      const keyboardInset = Math.max(nativeKeyboardInset, derivedKeyboardInset);
      const height = Math.max(
        0,
        Math.round(window.innerHeight - keyboardInset - offsetTop),
      );

      root.style.setProperty('--app-viewport-height', `${height}px`);
      root.style.setProperty('--app-viewport-offset-top', `${offsetTop}px`);
      root.style.setProperty(
        '--app-keyboard-inset-height',
        `${keyboardInset}px`,
      );
    };

    const revealActiveEntry = () => {
      const activeElement = document.activeElement;
      if (!isTextEntryElement(activeElement)) {
        return;
      }

      const viewport = window.visualViewport;
      const nativeKeyboardInset = readNativeKeyboardInsetHeight();
      const rect = activeElement.getBoundingClientRect();
      const visibleTop = (viewport?.offsetTop ?? 0) + 12;
      const viewportVisibleBottom = viewport
        ? viewport.offsetTop + viewport.height - 20
        : window.innerHeight - 20;
      const nativeVisibleBottom = window.innerHeight - nativeKeyboardInset - 20;
      const visibleBottom = Math.min(
        viewportVisibleBottom,
        nativeVisibleBottom,
      );

      if (rect.top < visibleTop || rect.bottom > visibleBottom) {
        activeElement.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
        });
      }
    };

    const scheduleViewportSync = (revealActiveElement = false) => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        applyViewportMetrics();
        if (revealActiveElement) {
          revealActiveEntry();
        }
      });
    };

    const handleViewportChange = () => {
      scheduleViewportSync(true);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTextEntryElement(event.target)) {
        return;
      }

      scheduleViewportSync(true);
      window.clearTimeout(focusTimeoutId);
      focusTimeoutId = window.setTimeout(() => {
        applyViewportMetrics();
        revealActiveEntry();
      }, 80);
    };

    const handleFocusOut = () => {
      window.clearTimeout(blurTimeoutId);
      blurTimeoutId = window.setTimeout(() => {
        scheduleViewportSync();
      }, 80);
    };

    const handleNativeKeyboardInsetChange = (event: Event) => {
      const nextInsetRaw =
        event instanceof CustomEvent && typeof event.detail?.height === 'number'
          ? event.detail.height
          : 0;

      writeNativeKeyboardInsetHeight(nextInsetRaw);
      scheduleViewportSync(true);
    };

    scheduleViewportSync();

    const handleVisualViewportResize = () => {
      handleViewportChange();
    };
    const handleVisualViewportScroll = () => {
      handleViewportChange();
    };
    const handleWindowResize = () => {
      handleViewportChange();
    };
    const handleOrientationChange = () => {
      handleViewportChange();
    };

    window.visualViewport?.addEventListener(
      'resize',
      handleVisualViewportResize,
    );
    window.visualViewport?.addEventListener(
      'scroll',
      handleVisualViewportScroll,
    );
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener(
      tauriKeyboardInsetChangeEvent,
      handleNativeKeyboardInsetChange,
    );
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(focusTimeoutId);
      window.clearTimeout(blurTimeoutId);
      window.visualViewport?.removeEventListener(
        'resize',
        handleVisualViewportResize,
      );
      window.visualViewport?.removeEventListener(
        'scroll',
        handleVisualViewportScroll,
      );
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener(
        tauriKeyboardInsetChangeEvent,
        handleNativeKeyboardInsetChange,
      );
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      writeNativeKeyboardInsetHeight(0);
      root.style.removeProperty('--app-viewport-height');
      root.style.removeProperty('--app-viewport-offset-top');
      root.style.removeProperty('--app-keyboard-inset-height');
    };
  }, []);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <TooltipProvider>
          <TauriViewportSync />
          <DevServiceWorkerCleanup />
          <LazyRuntimeProvider>
            {children}
            {!supportsPwa || import.meta.env.DEV ? null : <PwaUpdatePrompt />}
            <ThemedToaster />
          </LazyRuntimeProvider>
        </TooltipProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
