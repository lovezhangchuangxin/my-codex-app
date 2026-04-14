import { useDeferredValue, useState } from 'react';
import { ArrowLeft, Check, Copy, Folder, Play, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThreadCard } from '@/features/threads/components/thread-card';
import { ThreadStatusTabs } from '@/features/threads/components/thread-status-tabs';
import {
  matchesThreadFilter,
  type ThreadStatusFilter,
} from '@/features/threads/lib/thread-utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import type { ThreadListState } from '@my-codex-app/sdk';
import type {
  LocalConnectionState,
  ProjectSummary,
} from '@my-codex-app/protocol';

export function ProjectSessionsPanel({
  className,
  connectionState,
  createPending,
  isDesktop,
  onBack,
  onCreateThread,
  onOpenThread,
  project,
  selectedThreadId,
  sessionsState,
}: {
  className?: string;
  connectionState: LocalConnectionState;
  createPending: boolean;
  isDesktop: boolean;
  onBack: () => void;
  onCreateThread: (projectPath: string) => void;
  onOpenThread: (threadId: string) => void;
  project: ProjectSummary | null;
  selectedThreadId: string | null;
  sessionsState: ThreadListState;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>('all');
  const deferredSearch = useDeferredValue(search);

  const visibleThreads =
    sessionsState.kind === 'ready'
      ? sessionsState.threads.filter((thread) =>
          matchesThreadFilter(thread, deferredSearch, statusFilter),
        )
      : [];

  if (project === null) {
    return (
      <Card
        className={cn(
          'flex h-full flex-col overflow-hidden bg-card/65',
          className,
        )}
      >
        <CardContent className="flex h-full items-center justify-center p-6 text-center">
          <div className="space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
              <Folder className="size-5" />
            </div>
            <p className="font-heading text-xl tracking-[-0.04em]">
              {t('project.sessions.empty.noProject.title')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('project.sessions.empty.noProject.message')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex h-full flex-col overflow-hidden bg-card/65',
        className,
      )}
    >
      <CardHeader className="gap-4 border-b border-subtle/6 bg-background/35 pt-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-auto items-center gap-2">
            {!isDesktop ? (
              <Button onClick={onBack} size="icon-sm" variant="ghost">
                <ArrowLeft className="size-4" />
                <span className="sr-only">
                  {t('project.sessions.action.back')}
                </span>
              </Button>
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  aria-haspopup="dialog"
                  className="min-w-0 truncate text-left font-heading text-xl font-medium tracking-[-0.04em] hover:text-muted-foreground"
                  type="button"
                >
                  {project.displayName}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={4}>
                <div className="space-y-2">
                  <p className="font-mono text-xs break-all">{project.path}</p>
                  <CopyPathButton path={project.path} />
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            className="shrink-0"
            disabled={
              createPending ||
              !project.available ||
              connectionState.kind !== 'authenticated'
            }
            onClick={() => {
              onCreateThread(project.path);
            }}
            size="sm"
          >
            <Play className="size-4" />
            {t('project.sessions.action.new')}
          </Button>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="group relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground/60" />
            <Input
              className="h-9 w-full min-w-0 rounded-xl border-subtle/10 bg-accent/60 pl-9 text-sm tracking-[0.02em] placeholder:text-muted-foreground/60 focus-visible:border-subtle/20 focus-visible:bg-accent/80 focus-visible:ring-1 focus-visible:ring-subtle/15"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder={t('project.sessions.searchPlaceholder')}
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
          <div className="space-y-4 pb-4">
            {!project.available ? (
              <Alert className="mt-4 border-destructive/20 bg-destructive/5">
                <AlertTitle>
                  {t('project.sessions.unavailable.title')}
                </AlertTitle>
                <AlertDescription>
                  {t('project.sessions.unavailable.message')}
                </AlertDescription>
              </Alert>
            ) : null}

            {sessionsState.kind === 'loading' ? (
              <div className="grid gap-3 pt-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="rounded-[18px] bg-accent/70 p-4" key={index}>
                    <div className="space-y-3">
                      <div className="h-5 w-3/5 rounded-full bg-background/55" />
                      <div className="h-4 w-full rounded-full bg-background/40" />
                      <div className="h-4 w-2/3 rounded-full bg-background/35" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {sessionsState.kind === 'error' ? (
              <Card className="bg-destructive/8">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium text-destructive">
                    {t('project.sessions.error.loadTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {sessionsState.message}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {sessionsState.kind === 'ready' &&
            sessionsState.threads.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <Play className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {t('project.sessions.empty.noSessions.title')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('project.sessions.empty.noSessions.message')}
                  </p>
                  <div className="pt-1">
                    <Button
                      disabled={
                        createPending ||
                        !project.available ||
                        connectionState.kind !== 'authenticated'
                      }
                      onClick={() => {
                        onCreateThread(project.path);
                      }}
                      size="sm"
                    >
                      <Play className="size-4" />
                      {t('project.sessions.action.new')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {sessionsState.kind === 'ready' &&
            sessionsState.threads.length > 0 &&
            visibleThreads.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <Search className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {t('project.sessions.empty.noMatches.title')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('project.sessions.empty.noMatches.message')}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {sessionsState.kind === 'ready'
              ? visibleThreads.map((thread) => (
                  <ThreadCard
                    isSelected={selectedThreadId === thread.id}
                    key={thread.id}
                    onOpen={onOpenThread}
                    showWorkspace={false}
                    thread={thread}
                  />
                ))
              : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function CopyPathButton({ path }: { path: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  return (
    <Button
      className="h-7 w-full"
      onClick={() => {
        void navigator.clipboard.writeText(path).then(
          () => {
            setCopied(true);
            toast.success(t('project.sessions.toast.copyPathSuccess'));
            setTimeout(() => setCopied(false), 2000);
          },
          () => {
            toast.error(t('project.sessions.toast.copyPathError'));
          },
        );
      }}
      size="sm"
      variant="outline"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {t('project.sessions.action.copyPath')}
    </Button>
  );
}
