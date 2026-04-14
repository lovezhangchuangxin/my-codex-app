import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { bridgeBaseUrl } from '@/lib/env';
import { useI18n } from '@/lib/i18n/use-i18n';
import { BrowserBridgeCredentialStore } from '@/lib/runtime/bridge-credential-store';
import {
  normalizeBridgeBaseUrl,
  resolveBridgeTargetInputValue,
  toBridgeHealthUrl,
  writeStoredBridgeBaseUrl,
} from '@/lib/runtime/bridge-target-store';
import { isTauriHost } from '@/platform/host';
import { BridgeClient } from '@my-codex-app/sdk';

import { detectDeviceInfo } from './device-info';

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

export function PairingScreen() {
  const { t } = useI18n();

  const [bridgeTarget, setBridgeTarget] = useState(resolveBridgeTargetInputValue);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingState, setPairingState] = useState<PairingState>({
    status: 'idle',
  });
  const [bridgeAvailability, setBridgeAvailability] =
    useState<BridgeAvailability>({
      status: 'unknown',
    });

  const normalizedBridgeTarget = useMemo(
    () => normalizeBridgeBaseUrl(bridgeTarget),
    [bridgeTarget],
  );

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
        const response = await fetch(toBridgeHealthUrl(normalizedBridgeTarget), {
          signal: AbortSignal.timeout(5000),
        });
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

      setPairingState({ status: 'submitting' });

      try {
        const device = detectDeviceInfo();
        const pairingClient = new BridgeClient({
          baseUrl: normalizedBridgeTarget,
          credentialStore: new BrowserBridgeCredentialStore(
            normalizedBridgeTarget,
          ),
        });
        await pairingClient.completePairing({ code, device });
        writeStoredBridgeBaseUrl(normalizedBridgeTarget);
        setPairingState({ status: 'success' });
        window.location.replace('/threads');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('pairing.error.generic');
        setPairingState({ status: 'error', message });
      }
    },
    [normalizedBridgeTarget, pairingCode, t],
  );

  const isSubmitting = pairingState.status === 'submitting';

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-8 lg:min-h-[calc(100dvh-60px)]">
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
          <div className="space-y-1.5">
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
            <p className="text-xs leading-5 text-muted-foreground">
              {isTauriHost
                ? t('connection.target.hint.tauri')
                : t('connection.target.hint.web', {
                    target: bridgeBaseUrl,
                  })}
            </p>
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
        </form>
      </div>
    </div>
  );
}
