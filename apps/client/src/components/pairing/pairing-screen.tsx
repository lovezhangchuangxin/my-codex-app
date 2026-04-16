import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, KeyRound, QrCode } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/use-i18n';
import { BrowserBridgeCredentialStore } from '@/lib/runtime/bridge-credential-store';
import {
  normalizeBridgeBaseUrl,
  resolveBridgeTargetInputValue,
  toBridgeHealthUrl,
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

type BridgeAvailability =
  | { status: 'unknown' }
  | { status: 'missingTarget' }
  | { status: 'reachable' }
  | { status: 'unreachable' };

type PairingView = 'form' | 'scanner';

export function PairingScreen() {
  const { t } = useI18n();

  const [bridgeTarget, setBridgeTarget] = useState(
    resolveBridgeTargetInputValue,
  );
  const [pairingCode, setPairingCode] = useState('');
  const [pairingState, setPairingState] = useState<PairingState>({
    status: 'idle',
  });
  const [bridgeAvailability, setBridgeAvailability] =
    useState<BridgeAvailability>({
      status: 'unknown',
    });
  const [view, setView] = useState<PairingView>('form');
  const pairingInFlight = useRef(false);

  const normalizedBridgeTarget = useMemo(
    () => normalizeBridgeBaseUrl(bridgeTarget),
    [bridgeTarget],
  );

  const doPair = useCallback(
    async (bridgeUrl: string, code: string) => {
      if (pairingInFlight.current) return;
      pairingInFlight.current = true;
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

    setBridgeTarget(bridgeUrl);
    setPairingCode(paramCode);
    void doPair(bridgeUrl, paramCode);
  }, [doPair]);

  const handleScanResult = useCallback(
    (result: { bridgeUrl: string; code: string }) => {
      setBridgeTarget(result.bridgeUrl);
      setPairingCode(result.code);
      setView('form');
      void doPair(result.bridgeUrl, result.code);
    },
    [doPair],
  );

  const [scanError, setScanError] = useState<string | null>(null);

  const handleScanError = useCallback((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : error instanceof DOMException
          ? error.name
          : String(error);
    setScanError(message || 'unknown');
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkBridge() {
      if (!normalizedBridgeTarget) {
        if (!cancelled) {
          setBridgeAvailability({ status: 'missingTarget' });
        }
        return;
      }

      try {
        const response = await fetch(
          toBridgeHealthUrl(normalizedBridgeTarget),
          {
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) throw new Error('not ok');
        if (!cancelled) setBridgeAvailability({ status: 'reachable' });
      } catch {
        if (!cancelled) setBridgeAvailability({ status: 'unreachable' });
      }
    }

    void checkBridge();
    return () => {
      cancelled = true;
    };
  }, [normalizedBridgeTarget]);

  const handleSubmit = useCallback(
    async (event: { preventDefault: () => void }) => {
      event.preventDefault();

      const code = pairingCode.trim();
      if (code.length === 0) return;
      if (!normalizedBridgeTarget) {
        setPairingState({
          status: 'error',
          message: t('connection.target.invalid'),
        });
        return;
      }

      void doPair(normalizedBridgeTarget, code);
    },
    [normalizedBridgeTarget, pairingCode, t, doPair],
  );

  const isSubmitting = pairingState.status === 'submitting';

  if (view === 'scanner') {
    return (
      <div
        className="flex flex-col items-center px-8 [--pairing-shell-offset:8rem] lg:[--pairing-shell-offset:60px]"
        style={{
          minHeight: `calc(${appViewportDynamicHeight} - var(--pairing-shell-offset))`,
        }}
      >
        <div className="w-full max-w-sm">
          <button
            type="button"
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setView('form')}
          >
            <ArrowLeft className="size-4" />
            {t('pairing.backToManual')}
          </button>

          <h1 className="mb-4 text-xl font-semibold tracking-tight">
            {t('pairing.scanQr')}
          </h1>

          <div className="overflow-hidden rounded-lg">
            {scanError ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg bg-muted px-4">
                <p className="max-w-xs text-center text-sm text-muted-foreground">
                  {t('pairing.cameraUnavailable')}
                </p>
                <p className="max-w-xs text-center text-xs text-muted-foreground/60">
                  {scanError}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScanError(null)}
                >
                  {t('pairing.scanQr')}
                </Button>
              </div>
            ) : (
              <Suspense fallback={<div className="h-64 bg-muted" />}>
                <QrScanner
                  onScan={handleScanResult}
                  onError={handleScanError}
                />
              </Suspense>
            )}
          </div>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('pairing.scanQrHint')}
          </p>
        </div>
      </div>
    );
  }

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
            <KeyRound className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t('pairing.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('pairing.subtitle')}
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

          <p className="text-[13px] text-muted-foreground text-center">
            {t('pairing.helperPrefix')}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              pnpm dev:bridge
            </code>{' '}
            {t('pairing.helperSuffix')}
          </p>

          {pairingState.status === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>{pairingState.message}</AlertDescription>
            </Alert>
          ) : null}

          {bridgeAvailability.status === 'unreachable' &&
          pairingState.status === 'idle' ? (
            <Alert>
              <AlertDescription>
                {t('pairing.bridgeUnavailableWithTarget', {
                  target: normalizedBridgeTarget ?? undefined,
                })}
              </AlertDescription>
            </Alert>
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
            className="w-full"
            disabled={isSubmitting}
            size="lg"
            type="button"
            variant="outline"
            onClick={() => {
              setScanError(null);
              setView('scanner');
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
