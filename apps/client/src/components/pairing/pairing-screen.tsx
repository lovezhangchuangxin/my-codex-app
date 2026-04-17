import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Keyboard, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/use-i18n';
import { BrowserBridgeCredentialStore } from '@/lib/runtime/bridge-credential-store';
import {
  normalizeBridgeBaseUrl,
  writeStoredBridgeBaseUrl,
} from '@/lib/runtime/bridge-target-store';
import { appViewportDynamicHeight } from '@/platform/viewport';
import { BridgeClient } from '@my-codex-app/sdk';

import { detectDeviceInfo } from './device-info';

const QrScanner = lazy(() =>
  import('./qr-scanner').then((m) => ({ default: m.QrScanner })),
);

type PairingState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { message: string; status: 'error' };

export function PairingScreen() {
  const { t } = useI18n();

  const [pairingState, setPairingState] = useState<PairingState>({
    status: 'idle',
  });
  const [scanError, setScanError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [bridgeTarget, setBridgeTarget] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const pairingInFlight = useRef(false);

  const doPair = useCallback(
    async (bridgeUrl: string, code: string) => {
      if (pairingInFlight.current) return;
      pairingInFlight.current = true;
      setScanError(null);
      setPairingState({ status: 'submitting' });
      try {
        const device = detectDeviceInfo();
        const pairingClient = new BridgeClient({
          baseUrl: bridgeUrl,
          credentialStore: new BrowserBridgeCredentialStore(bridgeUrl),
        });
        await pairingClient.completePairing({ code, device });
        writeStoredBridgeBaseUrl(bridgeUrl);
        setPairingState({ status: 'success' });
        window.history.replaceState({}, '', '/pair');
        window.location.replace('/threads');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('pairing.error.generic');
        setPairingState({ status: 'error', message });
      } finally {
        pairingInFlight.current = false;
      }
    },
    [t],
  );

  // Auto-pair from URL params (?bridge=...&code=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramBridge = params.get('bridge');
    const paramCode = params.get('code');
    if (!paramBridge || !paramCode) return;

    const bridgeUrl = normalizeBridgeBaseUrl(paramBridge);
    if (!bridgeUrl) return;

    void doPair(bridgeUrl, paramCode);
  }, [doPair]);

  const handleScanResult = useCallback(
    (result: { bridgeUrl: string; code: string }) => {
      void doPair(result.bridgeUrl, result.code);
    },
    [doPair],
  );

  const handleScanError = useCallback((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : error instanceof DOMException
          ? error.name
          : String(error);
    setScanError(message || 'unknown');
  }, []);

  const handleSubmit = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault();

      const code = pairingCode.trim();
      if (code.length === 0) return;
      const bridgeUrl = normalizeBridgeBaseUrl(bridgeTarget);
      if (!bridgeUrl) {
        setPairingState({
          status: 'error',
          message: t('connection.target.invalid'),
        });
        return;
      }

      void doPair(bridgeUrl, code);
    },
    [bridgeTarget, pairingCode, t, doPair],
  );

  const isSubmitting = pairingState.status === 'submitting';

  if (showManual) {
    return (
      <div
        className="flex items-center justify-center px-8 [--pairing-shell-offset:8rem] lg:[--pairing-shell-offset:60px]"
        style={{
          minHeight: `calc(${appViewportDynamicHeight} - var(--pairing-shell-offset))`,
        }}
      >
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center space-y-1.5 text-center">
            <div className="flex size-10 items-center justify-center rounded-full border bg-muted">
              <Keyboard className="size-5 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('pairing.enterManually')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('pairing.enterManuallyHint')}
            </p>
          </div>

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-2.5">
              <label
                className="text-xs font-mono tracking-[0.14em] uppercase text-muted-foreground"
                htmlFor="bridge-target"
              >
                {t('connection.target.label')}
              </label>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                disabled={isSubmitting}
                id="bridge-target"
                onChange={(event) => {
                  setBridgeTarget(event.target.value);
                }}
                placeholder={t('connection.target.placeholder')}
                spellCheck={false}
                type="url"
                value={bridgeTarget}
              />
            </div>

            <Input
              autoFocus={false}
              disabled={isSubmitting}
              id="pairing-code"
              onChange={(event) => {
                setPairingCode(event.target.value);
              }}
              placeholder={t('pairing.codePlaceholder')}
              value={pairingCode}
            />

            {pairingState.status === 'error' ? (
              <p className="text-center text-sm text-destructive">
                {pairingState.message}
              </p>
            ) : null}

            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={
                isSubmitting || pairingCode.trim().length === 0
              }
              size="lg"
              type="submit"
              variant="outline"
            >
              {isSubmitting
                ? t('pairing.connecting')
                : t('pairing.connect')}
            </Button>

            <Button
              aria-label={t('pairing.scanQr')}
              className="w-full"
              disabled={isSubmitting}
              size="lg"
              type="button"
              variant="outline"
              onClick={() => {
                setScanError(null);
                setShowManual(false);
              }}
            >
              <QrCode className="mr-2 size-4" />
              {t('pairing.scanQr')}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center px-8 [--pairing-shell-offset:8rem] lg:[--pairing-shell-offset:60px]"
      style={{
        minHeight: `calc(${appViewportDynamicHeight} - var(--pairing-shell-offset))`,
      }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center space-y-1.5 text-center">
          <div className="flex size-10 items-center justify-center rounded-full border bg-muted">
            <QrCode className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t('pairing.scanQr')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('pairing.scanQrHint')}
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg">
          {isSubmitting ? (
            <div
              role="status"
              className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg bg-muted"
            >
              <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                {t('pairing.connecting')}
              </p>
            </div>
          ) : pairingState.status === 'error' ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg bg-destructive/10 px-4">
              <p className="max-w-xs text-center text-sm text-destructive">
                {pairingState.message}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setScanError(null);
                  setPairingState({ status: 'idle' });
                }}
              >
                {t('pairing.scanQr')}
              </Button>
            </div>
          ) : scanError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg bg-muted px-4">
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                {t('pairing.cameraUnavailable')}
              </p>
              <p className="max-w-xs text-center text-xs text-muted-foreground/60">
                {scanError}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScanError(null)}
                >
                  {t('pairing.scanQr')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowManual(true)}
                >
                  {t('pairing.enterManually')}
                </Button>
              </div>
            </div>
          ) : (
            <Suspense fallback={<div className="h-64 rounded-lg bg-muted" />}>
              <QrScanner
                onScan={handleScanResult}
                onError={handleScanError}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
