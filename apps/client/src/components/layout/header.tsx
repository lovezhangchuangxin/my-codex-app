import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ConnectionIndicator } from '@/components/layout/connection-indicator';
import { NotificationBell } from '@/components/layout/notification-bell';
import { RequestSheet } from '@/features/requests/components/request-sheet';
import { SettingsSheet } from '@/components/settings/settings-sheet';
import { useI18n } from '@/lib/i18n/use-i18n';

export function Header() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function handleOpenThread(threadId: string, requestKey?: string) {
    setRequestSheetOpen(false);
    navigate({
      pathname: `/threads/${encodeURIComponent(threadId)}`,
      ...(requestKey
        ? { search: `?request=${encodeURIComponent(requestKey)}` }
        : {}),
    });
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-subtle/6 bg-card px-4 lg:h-[60px] lg:px-6">
        <div className="flex items-center gap-2">
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">
            {t('header.brand')}
          </span>
        </div>

        <div className="hidden flex-1 items-center justify-center px-8 lg:flex">
          <div className="w-full max-w-md rounded-lg border border-subtle/6 bg-background/50 px-3 py-1.5 font-mono text-sm text-muted-foreground">
            {t('header.searchPlaceholder')}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <NotificationBell
            onClick={() => {
              setRequestSheetOpen((v) => !v);
            }}
          />
          <Button
            aria-label={t('header.openSettings')}
            className="relative"
            onClick={() => {
              setSettingsOpen((v) => !v);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <Settings className="size-4" />
          </Button>
          <ConnectionIndicator />
        </div>
      </header>

      <RequestSheet
        onOpenChange={setRequestSheetOpen}
        onOpenThread={handleOpenThread}
        open={requestSheetOpen}
      />
      <SettingsSheet onOpenChange={setSettingsOpen} open={settingsOpen} />
    </>
  );
}
