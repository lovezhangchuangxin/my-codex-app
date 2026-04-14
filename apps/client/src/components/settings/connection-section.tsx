import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { bridgeBaseUrl } from '@/lib/env';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  normalizeBridgeBaseUrl,
  writeStoredBridgeBaseUrl,
} from '@/lib/runtime/bridge-target-store';
import { isTauriHost } from '@/platform/host';
import { formatConnectionKind } from '@/lib/runtime/connection-utils';
import { useRuntime } from '@/lib/runtime/runtime-provider';
import { useRuntimeSnapshot } from '@/lib/runtime/use-runtime-snapshot';
import { cn } from '@/lib/utils';

export function ConnectionSection() {
  const { t } = useI18n();
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const { kind, message } = snapshot.connection;
  const [bridgeTarget, setBridgeTarget] = useState(bridgeBaseUrl);
  const [bridgeTargetError, setBridgeTargetError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setBridgeTarget(bridgeBaseUrl);
  }, [bridgeBaseUrl]);

  const color =
    kind === 'authenticated'
      ? 'bg-emerald-500'
      : kind === 'reconnecting' || kind === 'refreshing' || kind === 'resyncing'
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        {t('settings.connection.title')}
      </h3>

      <div className="space-y-2 rounded-xl border border-subtle/8 bg-background/42 p-3">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', color)} />
          <span className="text-sm font-medium text-foreground">
            {formatConnectionKind(kind, t)}
          </span>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {bridgeBaseUrl}
        </p>
        <div className="space-y-2">
          <label
            className="text-[11px] font-mono tracking-[0.14em] uppercase text-muted-foreground"
            htmlFor="settings-bridge-target"
          >
            {t('connection.target.label')}
          </label>
          <Input
            autoCapitalize="none"
            autoCorrect="off"
            id="settings-bridge-target"
            onChange={(event) => {
              setBridgeTarget(event.target.value);
              if (bridgeTargetError) {
                setBridgeTargetError(null);
              }
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
          {bridgeTargetError ? (
            <p className="text-xs text-destructive">{bridgeTargetError}</p>
          ) : null}
        </div>
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
        <Button
          className="w-full"
          onClick={() => {
            const normalized = normalizeBridgeBaseUrl(bridgeTarget);
            if (!normalized) {
              setBridgeTargetError(t('connection.target.invalid'));
              return;
            }

            writeStoredBridgeBaseUrl(normalized);
            if (normalized !== bridgeBaseUrl) {
              window.location.reload();
            }
          }}
          size="sm"
          variant="outline"
        >
          {t('connection.target.apply')}
        </Button>
        <Button
          className="w-full"
          onClick={() => {
            void runtime.retryConnection();
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCcw className="size-3.5" />
          {t('connection.action.reconnect')}
        </Button>
      </div>
    </div>
  );
}
