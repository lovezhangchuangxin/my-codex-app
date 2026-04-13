import { useDeferredValue, useState } from 'react';
import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ThreadListState } from '@my-codex-app/sdk';
import type { LocalConnectionState } from '@my-codex-app/protocol';
import { ThreadStatusTabs } from '@/features/threads/components/thread-status-tabs';
import { WorkspaceGroup } from '@/features/threads/components/workspace-group';
import { useI18n } from '@/lib/i18n/use-i18n';

import {
  groupThreadsByWorkspace,
  matchesThreadFilter,
  type ThreadStatusFilter,
} from '@/features/threads/lib/thread-utils';
import { cn } from '@/lib/utils';

export function ThreadListPanel({
  connectionState,
  onOpenThread,
  selectedThreadId,
  threadsState,
  className,
}: {
  connectionState: LocalConnectionState;
  onOpenThread: (threadId: string) => void;
  selectedThreadId: string | null;
  threadsState: ThreadListState;
  className?: string;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>('all');
  const deferredSearch = useDeferredValue(search);

  const visibleThreads =
    threadsState.kind === 'ready'
      ? threadsState.threads.filter((thread) =>
          matchesThreadFilter(thread, deferredSearch, statusFilter),
        )
      : [];
  const totalThreads =
    threadsState.kind === 'ready' ? threadsState.threads.length : 0;
  const filterCount =
    threadsState.kind === 'ready'
      ? threadsState.threads.filter((thread) =>
          matchesThreadFilter(thread, deferredSearch, statusFilter),
        ).length
      : 0;

  const groupedThreads = groupThreadsByWorkspace(visibleThreads, t);

  return (
    <Card className={cn('h-full overflow-hidden bg-card/65', className)}>
      <CardHeader className="gap-4 border-b border-subtle/6 bg-background/35">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-[0.7rem] tracking-[0.18em] text-primary/85 uppercase">
            {t('thread.list.eyebrow')}
          </p>
          <CardTitle className="text-xl tracking-[-0.04em]">
            {t('thread.list.title')}
          </CardTitle>
          <CardDescription>{t('thread.list.description')}</CardDescription>
        </div>

        <div className="min-w-0 space-y-3">
          {threadsState.kind === 'ready' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className="border border-subtle/6 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground"
                variant="secondary"
              >
                {t('thread.list.badge.visibleCount', {
                  count: visibleThreads.length,
                })}
              </Badge>
              <Badge
                className="border border-subtle/6 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground"
                variant="secondary"
              >
                {t('thread.list.badge.filterCount', { count: filterCount })}
              </Badge>
              <Badge
                className="border border-subtle/6 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground"
                variant="secondary"
              >
                {t('thread.list.badge.loadedCount', { count: totalThreads })}
              </Badge>
            </div>
          ) : null}

          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-full min-w-0 bg-accent pl-9 font-mono text-sm tracking-[0.02em] transition-shadow duration-200 placeholder:text-muted-foreground/55 focus-visible:ring-1 focus-visible:ring-primary/40"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder={t('thread.list.searchPlaceholder')}
              value={search}
            />
          </div>

          <ThreadStatusTabs
            onChange={(nextValue) => {
              setStatusFilter(nextValue);
            }}
            value={statusFilter}
          />
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className="h-full px-4">
          <div className="space-y-5 pb-2">
            {threadsState.kind === 'loading' ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="rounded-[18px] bg-accent/70 p-4" key={index}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-20 rounded-full bg-background/55" />
                        <div className="h-6 w-16 rounded-full bg-background/40" />
                      </div>
                      <div className="h-5 w-3/4 rounded-full bg-background/55" />
                      <div className="h-4 w-full rounded-full bg-background/40" />
                      <div className="h-4 w-2/3 rounded-full bg-background/35" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {threadsState.kind === 'error' ? (
              <Card className="bg-destructive/8">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium text-destructive">
                    {t('thread.list.error.loadTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {threadsState.message}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {threadsState.kind === 'idle' ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <Search className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {idleThreadListTitle(connectionState, t)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {idleThreadListMessage(connectionState, t)}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {threadsState.kind === 'ready' && groupedThreads.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <Search className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {t('thread.list.empty.noMatches.title')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('thread.list.empty.noMatches.message')}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {threadsState.kind === 'ready'
              ? groupedThreads.map((group) => (
                  <WorkspaceGroup
                    isSelected={(threadId) => selectedThreadId === threadId}
                    key={group.workspace}
                    onOpen={onOpenThread}
                    threads={group.items}
                    workspace={group.workspace}
                  />
                ))
              : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function idleThreadListTitle(
  connectionState: LocalConnectionState,
  t: (key: string) => string,
): string {
  switch (connectionState.kind) {
    case 'unpaired':
      return t('thread.idle.unpaired.title');
    case 'revoked':
      return t('thread.idle.revoked.title');
    case 'expired':
      return t('thread.idle.expired.title');
    case 'refreshing':
      return t('thread.idle.refreshing.title');
    case 'reconnecting':
      return t('thread.idle.reconnecting.title');
    case 'resyncing':
      return t('thread.idle.resyncing.title');
    case 'disconnected':
      return t('thread.idle.disconnected.title');
    default:
      return t('thread.idle.generic.title');
  }
}

function idleThreadListMessage(
  connectionState: LocalConnectionState,
  t: (key: string) => string,
): string {
  switch (connectionState.kind) {
    case 'unpaired':
      return t('thread.idle.unpaired.message');
    case 'revoked':
      return connectionState.message ?? t('thread.idle.revoked.message');
    case 'expired':
      return connectionState.message ?? t('thread.idle.expired.message');
    case 'refreshing':
      return t('thread.idle.refreshing.message');
    case 'reconnecting':
      return connectionState.message ?? t('thread.idle.reconnecting.message');
    case 'resyncing':
      return t('thread.idle.resyncing.message');
    case 'disconnected':
      return connectionState.message ?? t('thread.idle.disconnected.message');
    default:
      return t('thread.idle.generic.message');
  }
}
