import { LogOut, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { bridgeBaseUrl } from '@/lib/env';
import { useI18n } from '@/lib/i18n/use-i18n';
import { formatConnectionKind } from '@/lib/runtime/connection-utils';
import {
  useBridgeClient,
  useRuntime,
} from '@/lib/runtime/runtime-context';
import { useRuntimeSnapshot } from '@/lib/runtime/use-runtime-snapshot';
import { cn } from '@/lib/utils';

export function ConnectionSection() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const bridgeClient = useBridgeClient();
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const { kind, message } = snapshot.connection;

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
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
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
        <Button
          className="w-full"
          onClick={() => {
            bridgeClient.clearCredentials();
            runtime.resetState();
            navigate('/pair', { replace: true });
          }}
          size="sm"
          variant="outline"
        >
          <LogOut className="size-3.5" />
          {t('connection.action.logout')}
        </Button>
      </div>
    </div>
  );
}
