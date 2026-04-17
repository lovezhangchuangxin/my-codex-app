import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/use-i18n';
import { BrowserBridgeCredentialStore } from '@/lib/runtime/bridge-credential-store';
import { assertCompatibleBridgeVersion } from '@/lib/runtime/bridge-version';
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

type PairingView = 'form' | 'scanner';

type ScanFeedback = {
  kind: 'camera' | 'scan';
  message: string;
} | null;

type ScanFeedbackEntry = Exclude<ScanFeedback, null>;

export function PairingScreen() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [pairingState, setPairingState] = useState<PairingState>({
    status: 'idle',
  });
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>(null);
  const [view, setView] = useState<PairingView>('form');
  const [bridgeTarget, setBridgeTarget] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const pairingInFlight = useRef(false);

  const startScanner = useCallback(() => {
    setScanFeedback(null);
    setPairingState({ status: 'idle' });
    setView('scanner');
  }, []);

  const returnToManual = useCallback(() => {
    setScanFeedback(null);
    setPairingState({ status: 'idle' });
    setView('form');
  }, []);

  const doPair = useCallback(
    async (bridgeUrl: string, code: string) => {
      if (pairingInFlight.current) return;
      pairingInFlight.current = true;
      setScanFeedback(null);
      setPairingState({ status: 'submitting' });
      try {
        const device = detectDeviceInfo();
        const pairingClient = new BridgeClient({
          baseUrl: bridgeUrl,
          credentialStore: new BrowserBridgeCredentialStore(bridgeUrl),
        });
        await assertCompatibleBridgeVersion(pairingClient, t);
        await pairingClient.completePairing({ code, device });
        writeStoredBridgeBaseUrl(bridgeUrl);
        setPairingState({ status: 'success' });
        navigate('/threads', { replace: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('pairing.error.generic');
        setPairingState({ status: 'error', message });
      } finally {
        pairingInFlight.current = false;
      }
    },
    [t, navigate],
  );

  const handleScanResult = useCallback(
    (result: { bridgeUrl: string; code: string }) => {
      setScanFeedback(null);
      setPairingState({ status: 'idle' });
      setBridgeTarget(result.bridgeUrl);
      setPairingCode(result.code);
      setView('form');
      void doPair(result.bridgeUrl, result.code);
    },
    [doPair],
  );

  const handleScanError = useCallback(
    (error: unknown) => {
      const feedback = classifyScannerError(error, t);
      setScanFeedback(feedback);
      if (feedback.kind === 'camera') {
        setPairingState({ status: 'idle' });
        setView('form');
      }
    },
    [t],
  );

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
  const submittingLabel =
    view === 'scanner' ? t('pairing.autoPairing') : t('pairing.connecting');
  const showScanningHint =
    view === 'scanner' &&
    pairingState.status !== 'error' &&
    scanFeedback?.kind !== 'scan';

  if (isSubmitting) {
    return (
      <div
        className="flex items-center justify-center px-8 [--pairing-shell-offset:8rem] lg:[--pairing-shell-offset:60px]"
        style={{
          minHeight: `calc(${appViewportDynamicHeight} - var(--pairing-shell-offset))`,
        }}
      >
        <div
          role="status"
          className="flex h-64 w-full max-w-sm flex-col items-center justify-center gap-2 rounded-lg bg-muted"
        >
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">{submittingLabel}</p>
        </div>
      </div>
    );
  }

  if (view === 'form') {
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

          {scanFeedback ? (
            <div
              className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
                scanFeedback.kind === 'camera'
                  ? 'border-amber-200 bg-amber-50 text-amber-950'
                  : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {scanFeedback.message}
            </div>
          ) : null}

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
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
              disabled={isSubmitting || pairingCode.trim().length === 0}
              size="lg"
              type="submit"
              variant="outline"
            >
              {isSubmitting ? t('pairing.connecting') : t('pairing.connect')}
            </Button>

            <Button
              aria-label={t('pairing.scanQr')}
              className="w-full"
              disabled={isSubmitting}
              size="lg"
              type="button"
              variant="outline"
              onClick={() => {
                startScanner();
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
          {pairingState.status === 'error' ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg bg-destructive/10 px-4">
              <p className="max-w-xs text-center text-sm text-destructive">
                {pairingState.message}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={startScanner}>
                  {t('pairing.scanQr')}
                </Button>
                <Button size="sm" variant="outline" onClick={returnToManual}>
                  {t('pairing.backToManual')}
                </Button>
              </div>
            </div>
          ) : scanFeedback?.kind === 'scan' ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg bg-muted px-4">
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                {scanFeedback.message}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={startScanner}>
                  {t('pairing.scanQr')}
                </Button>
                <Button size="sm" variant="outline" onClick={returnToManual}>
                  {t('pairing.backToManual')}
                </Button>
              </div>
            </div>
          ) : (
            <Suspense fallback={<div className="h-64 rounded-lg bg-muted" />}>
              <QrScanner onScan={handleScanResult} onError={handleScanError} />
            </Suspense>
          )}
        </div>

        {pairingState.status !== 'error' && scanFeedback?.kind !== 'scan' ? (
          <div className="mt-4">
            <Button
              className="w-full"
              size="sm"
              type="button"
              variant="outline"
              onClick={returnToManual}
            >
              {t('pairing.backToManual')}
            </Button>
          </div>
        ) : null}

        {showScanningHint ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {t('pairing.scanning')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function classifyScannerError(
  error: unknown,
  t: (key: string) => string,
): ScanFeedbackEntry {
  if (error instanceof DOMException) {
    return isCameraErrorName(error.name)
      ? { kind: 'camera', message: t('pairing.cameraUnavailable') }
      : { kind: 'scan', message: t('pairing.scanFailed') };
  }

  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (isCameraErrorMessage(message)) {
    return { kind: 'camera', message: t('pairing.cameraUnavailable') };
  }

  if (message.toLowerCase().includes('invalid qr')) {
    return { kind: 'scan', message: t('pairing.scanFailed') };
  }

  return { kind: 'scan', message: t('pairing.scanFailed') };
}

function isCameraErrorName(name: string): boolean {
  return (
    name === 'NotAllowedError' ||
    name === 'NotFoundError' ||
    name === 'NotReadableError' ||
    name === 'OverconstrainedError' ||
    name === 'SecurityError'
  );
}

function isCameraErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('camera') ||
    normalized.includes('permission') ||
    normalized.includes('not allowed') ||
    normalized.includes('notfound') ||
    normalized.includes('not found') ||
    normalized.includes('not readable') ||
    normalized.includes('overconstrained') ||
    normalized.includes('secure context')
  );
}
