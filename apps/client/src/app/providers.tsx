import { useEffect, type ReactNode } from 'react';

import { PwaUpdatePrompt } from '@/components/common/pwa-update-prompt';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LocaleProvider } from '@/lib/i18n/provider';
import { RuntimeProvider } from '@/lib/runtime/runtime-provider';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { supportsPwa } from '@/platform/host';
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

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <TooltipProvider>
          <RuntimeProvider>
            <DevServiceWorkerCleanup />
            {children}
            {!supportsPwa || import.meta.env.DEV ? null : <PwaUpdatePrompt />}
            <ThemedToaster />
          </RuntimeProvider>
        </TooltipProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
