/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  readonly VITE_BRIDGE_BASE_URL?: string;
  readonly VITE_HOST_RUNTIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:pwa-register/react' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisteredSW?: (
      swScriptUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: Error) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: boolean;
    offlineReady: boolean;
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
