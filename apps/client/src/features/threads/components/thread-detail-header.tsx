import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  FolderOpen,
  PanelLeftOpen,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StatusBadge } from '@/features/threads/components/status-badge';
import {
  buildThreadTitle,
  formatStatusLabel,
  getStatusTone,
} from '@/features/threads/lib/thread-utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { ThreadDetail } from '@my-codex-app/protocol';

export function ThreadDetailHeader({
  isDesktop,
  onBack,
  onOpenThreadSwitcher,
  onOpenWorkspace,
  thread,
}: {
  isDesktop: boolean;
  onBack: () => void;
  onOpenThreadSwitcher: () => void;
  onOpenWorkspace: () => void;
  thread: ThreadDetail;
}) {
  const { t } = useI18n();

  return (
    <div className="shrink-0 border-b border-subtle/6 bg-background/35 px-4 py-3.5 md:px-5">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {!isDesktop ? (
            <Button onClick={onBack} size="icon-sm" variant="ghost">
              <ArrowLeft className="size-4" />
              <span className="sr-only">
                {t('detail.action.backToThreads')}
              </span>
            </Button>
          ) : null}
          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-heading text-[1.1rem] tracking-[-0.04em] md:max-w-[34rem] md:text-[1.32rem] lg:max-w-[42rem] xl:max-w-[48rem]">
                {buildThreadTitle(thread, t)}
              </h2>
              <div className="shrink-0">
                <StatusBadge
                  label={formatStatusLabel(thread.status, t)}
                  tone={getStatusTone(thread.status)}
                />
              </div>
            </div>
            <CwdPathDisplay cwd={thread.cwd} />
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 md:self-start">
          {!isDesktop ? (
            <Button
              onClick={onOpenThreadSwitcher}
              size="icon-sm"
              variant="outline"
            >
              <PanelLeftOpen className="size-4" />
              <span className="sr-only">{t('detail.switcher.open')}</span>
            </Button>
          ) : null}
          <Button onClick={onOpenWorkspace} size="sm" variant="outline">
            <FolderOpen className="size-3.5" />
            {t('detail.workspace.open')}
          </Button>
        </div>
      </div>

      {thread.pendingRequests.length > 0 ? (
        <div className="mt-3">
          <Badge
            className="bg-secondary/16 text-secondary pulse-secondary"
            variant="secondary"
          >
            {t('detail.badge.pendingRequests', {
              count: thread.pendingRequests.length,
            })}
          </Badge>
        </div>
      ) : null}
    </div>
  );
}

function CwdPathDisplay({ cwd }: { cwd: string }) {
  const displayName = cwd
    ? cwd.split(/[\\/]/).filter(Boolean).pop() || cwd
    : cwd;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Show full working directory path"
          className="truncate font-mono text-xs text-muted-foreground transition-colors hover:text-foreground md:text-sm"
          type="button"
        >
          {displayName}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-sm flex-row items-center gap-2 p-2.5"
      >
        <p className="min-w-0 break-all font-mono text-[0.7rem] leading-relaxed">
          {cwd}
        </p>
        <CopyPathButton value={cwd} />
      </PopoverContent>
    </Popover>
  );
}

function CopyPathButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="shrink-0 rounded-md p-1 text-popover-foreground/50 transition-colors hover:bg-subtle/10 hover:text-popover-foreground"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      type="button"
    >
      {copied ? (
        <Check className="size-3 text-primary" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}
