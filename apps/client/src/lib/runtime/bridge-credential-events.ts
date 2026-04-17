const BRIDGE_TARGET_STORAGE_KEY = 'my-codex-app.bridge-target';
const BRIDGE_CREDENTIAL_CHANGE_EVENT = 'my-codex-app:bridge-credential-change';
const BRIDGE_CREDENTIAL_STORAGE_KEY_PREFIX = `${BRIDGE_TARGET_STORAGE_KEY}:session:`;

export function bridgeCredentialStorageKey(baseUrl: string): string {
  return `${BRIDGE_TARGET_STORAGE_KEY}:session:${encodeURIComponent(baseUrl)}`;
}

export function hasStoredBridgeCredentials(baseUrl: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return (
      window.localStorage.getItem(bridgeCredentialStorageKey(baseUrl)) !== null
    );
  } catch {
    return false;
  }
}

export function notifyStoredBridgeCredentialsChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(BRIDGE_CREDENTIAL_CHANGE_EVENT));
}

export function subscribeToBridgeCredentialChange(
  listener: () => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key.startsWith(BRIDGE_CREDENTIAL_STORAGE_KEY_PREFIX)
    ) {
      listener();
    }
  };

  window.addEventListener(BRIDGE_CREDENTIAL_CHANGE_EVENT, listener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(BRIDGE_CREDENTIAL_CHANGE_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}
