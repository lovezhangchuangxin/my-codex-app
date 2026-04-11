import { useCallback, useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

export function PwaUpdatePrompt() {
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const { updateServiceWorker, needRefresh } = useRegisterSW({
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (registration) {
        intervalRef.current = setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    }
  });

  const handleUpdate = useCallback(() => {
    void updateServiceWorker(true);
  }, [updateServiceWorker]);

  useEffect(() => {
    if (!needRefresh) return;

    const id = toast.info("A new version is available", {
      duration: Infinity,
      action: {
        label: "Update",
        onClick: handleUpdate
      }
    });

    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, handleUpdate]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}
