import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/use-i18n';

export function PwaUpdatePrompt() {
  const { t } = useI18n();
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const shownRef = useRef(false);

  const { updateServiceWorker, needRefresh } = useRegisterSW({
    onRegisteredSW(
      _swUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) {
      if (registration) {
        intervalRef.current = setInterval(
          () => registration.update(),
          60 * 60 * 1000,
        );
      }
    },
  });

  useEffect(() => {
    if (!needRefresh) {
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;

    const id = toast.info(t('pwa.newVersion'), {
      duration: Infinity,
      action: {
        label: t('pwa.update'),
        onClick: () => {
          toast.dismiss(id);
          void updateServiceWorker(true);
        },
      },
    });
  }, [needRefresh, t, updateServiceWorker]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}
