import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Brain,
  ChevronDown,
  ExternalLink,
  FileCode2,
  GalleryHorizontal,
  Search,
  SquareTerminal,
  TriangleAlert,
} from 'lucide-react';

import { useVirtualizer } from '@tanstack/react-virtual';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { StatusBadge } from '@/features/threads/components/status-badge';
import type { WorkspaceBrowserRequestedTargetKind } from '@/features/threads/components/use-workspace-browser';
import {
  getCommandDisplay,
  looksLikeMarkdownContent,
} from '@/features/threads/components/thread-detail-utils';
import type { FlatThreadItem } from '@/features/threads/lib/thread-utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import type { ThreadItem, TurnError } from '@my-codex-app/protocol';

const LazyMarkdownContent = lazy(async () => {
  const module = await import('@/components/common/markdown-content');
  return { default: module.MarkdownContent };
});

const LazyCodeBlock = lazy(async () => {
  const module = await import('@/components/common/code-block');
  return { default: module.CodeBlock };
});

const LazyTerminalOutput = lazy(async () => {
  const module = await import('@/components/common/terminal-output');
  return { default: module.TerminalOutput };
});

// Preload lazy chunks at module load time (before any component renders)
// so the first render uses actual components instead of Suspense fallbacks.
void import('@/components/common/markdown-content');
void import('@/components/common/code-block');
void import('@/components/common/terminal-output');

const reasoningLiveStartMsByItemKey = new Map<string, number>();

function estimateItemSize(item: FlatThreadItem): number {
  switch (item.type) {
    case 'agentMessage': {
      const lines = item.text.split('\n').length;
      return Math.max(80, Math.min(lines * 22 + 32, 600));
    }
    case 'userMessage': {
      const textParts = item.content.filter((c) => c.type === 'text');
      const totalLen = textParts.reduce((s, c) => s + (c.text?.length ?? 0), 0);
      return Math.max(60, Math.min(Math.ceil(totalLen / 60) * 24 + 40, 300));
    }
    case 'reasoning':
      return 40;
    case 'commandExecution':
      return 56;
    case 'fileChange':
      return 80;
    default:
      return 40;
  }
}

export function ThreadMessageStream({
  flatItems,
  onFilePathClick,
  onOpenWorkspacePath,
  resolveWorkspacePath,
  scrollRef,
}: {
  flatItems: FlatThreadItem[];
  onFilePathClick?: ((href: string) => void) | undefined;
  onOpenWorkspacePath: (
    path: string,
    targetKind: WorkspaceBrowserRequestedTargetKind,
  ) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  // Preload lazy chunks at module level instead — see top of file.

  // Progressive overscan: render fewer items on first paint to reduce
  // synchronous markdown parsing overhead, then expand after first frame.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const hasActiveReasoning = flatItems.some(
    (item) => item.type === 'reasoning' && item.isReasoningLive,
  );
  useEffect(() => {
    const activeReasoningKeys = new Set(
      flatItems
        .filter((item) => item.type === 'reasoning' && item.isReasoningLive)
        .map((item) => `${item.turnId}:${item.id}`),
    );

    for (const key of reasoningLiveStartMsByItemKey.keys()) {
      if (!activeReasoningKeys.has(key)) {
        reasoningLiveStartMsByItemKey.delete(key);
      }
    }
  }, [flatItems]);

  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasActiveReasoning) {
      return;
    }

    setLiveNowMs(Date.now());
    const timer = setInterval(() => {
      setLiveNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [hasActiveReasoning]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateItemSize(flatItems[index]!),
    overscan: mounted ? 8 : 2,
    getItemKey: (index) => {
      const item = flatItems[index];
      return item ? `${item.turnId}-${item.id}` : index;
    },
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-4 md:px-5"
      ref={scrollRef}
    >
      <div
        className="mx-auto max-w-3xl pb-4"
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {items.map((virtualRow) => {
          const item = flatItems[virtualRow.index]!;
          return (
            <div
              key={`${item.turnId}-${item.id}`}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                contain: 'layout style paint',
              }}
            >
              <div className="pb-4">
                <FlatItemRenderer
                  liveNowMs={liveNowMs}
                  item={item}
                  nextItem={flatItems[virtualRow.index + 1] ?? null}
                  onFilePathClick={onFilePathClick}
                  onOpenWorkspacePath={onOpenWorkspacePath}
                  resolveWorkspacePath={resolveWorkspacePath}
                />
                {item.turnError ? (
                  <TurnErrorBanner error={item.turnError} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FlatItemRenderer = memo(function FlatItemRenderer({
  liveNowMs,
  item,
  nextItem,
  onFilePathClick,
  onOpenWorkspacePath,
  resolveWorkspacePath,
}: {
  liveNowMs: number;
  item: FlatThreadItem;
  nextItem: FlatThreadItem | null;
  onFilePathClick?: ((href: string) => void) | undefined;
  onOpenWorkspacePath: (
    path: string,
    targetKind: WorkspaceBrowserRequestedTargetKind,
  ) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
}) {
  const { t } = useI18n();

  switch (item.type) {
    case 'userMessage':
      return (
        <UserMessageBubble>
          {item.content.map((input, index) => (
            <UserInputRenderer
              input={input}
              key={`${item.id}-${index}`}
              onFilePathClick={onFilePathClick}
            />
          ))}
        </UserMessageBubble>
      );
    case 'agentMessage':
      return (
        <AgentMessageBlock>
          {item.text ? (
            <RichMarkdown
              content={item.text}
              onFilePathClick={onFilePathClick}
            />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {t('detail.agent.noTextReturned')}
            </p>
          )}
        </AgentMessageBlock>
      );
    case 'reasoning':
      return <ThinkingBlock item={item} liveNowMs={liveNowMs} />;
    case 'commandExecution':
      return <CommandCard item={item} />;
    case 'fileChange':
      return (
        <FileChangeCard
          item={item}
          onOpenWorkspacePath={onOpenWorkspacePath}
          resolveWorkspacePath={resolveWorkspacePath}
        />
      );
    case 'webSearch':
      return (
        <ToolLabel
          icon={<Search className="size-3" />}
          label={t('detail.tool.webSearch')}
          value={item.query}
        />
      );
    case 'imageView':
      return (
        <ToolLabel
          icon={<GalleryHorizontal className="size-3" />}
          label={t('detail.tool.image')}
          value={item.path}
        />
      );
    case 'enteredReviewMode':
      return (
        <SystemActivityLabel
          icon={<Search className="size-3" />}
          label={t('detail.review.inProgress')}
          value={item.review}
        />
      );
    case 'exitedReviewMode':
      if (
        nextItem?.type === 'agentMessage' &&
        nextItem.text.trim() === item.review.trim()
      ) {
        return null;
      }
      return <ReviewResultCard review={item.review} />;
    case 'contextCompaction':
      return (
        <SystemActivityLabel
          icon={<Brain className="size-3" />}
          label={t('detail.compaction.label')}
          value={t('detail.compaction.description')}
        />
      );
    case 'unknown':
      if (!item.title && item.raw === null) {
        return null;
      }
      return (
        <div className="lg:ml-9">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button size="xs" variant="ghost">
                <ExternalLink className="mr-1 size-3" />
                {item.title}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <RichCodeBlock className="bg-code-bg" language="json">
                {JSON.stringify(item.raw, null, 2)}
              </RichCodeBlock>
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
  }
});

function UserMessageBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-subtle/[0.06] px-4 py-3">
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function AgentMessageBlock({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="hidden size-6 shrink-0 items-center justify-center rounded-lg bg-primary/12 lg:flex">
        <img alt="" className="size-4" src="/openai.svg" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ThinkingBlock({
  liveNowMs,
  item,
}: {
  liveNowMs: number;
  item: Extract<FlatThreadItem, { type: 'reasoning' }>;
}) {
  const { formatDateTime, t } = useI18n();
  const isInProgress = item.isReasoningLive;
  const [open, setOpen] = useState(isInProgress);
  const liveKey = `${item.turnId}:${item.id}`;

  useEffect(() => {
    if (isInProgress) {
      if (!reasoningLiveStartMsByItemKey.has(liveKey)) {
        reasoningLiveStartMsByItemKey.set(liveKey, Date.now());
      }
      return;
    }

    reasoningLiveStartMsByItemKey.delete(liveKey);
  }, [isInProgress, liveKey]);

  const derivedLiveElapsedSeconds = (() => {
    if (!isInProgress) {
      return 0;
    }

    const startedAtMs = reasoningLiveStartMsByItemKey.get(liveKey);
    if (startedAtMs === undefined) {
      return 0;
    }

    return Math.max(0, Math.floor((liveNowMs - startedAtMs) / 1000));
  })();

  return (
    <div className="lg:ml-9">
      <button
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[0.8rem] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Brain className="size-3.5" />
        <span>
          {isInProgress
            ? t('detail.reasoning.thinking')
            : t('detail.reasoning.completed')}
          <span className="ml-1 tabular-nums">
            {isInProgress
              ? `${derivedLiveElapsedSeconds}s`
              : item.turnDurationMs !== undefined
                ? `${Math.round(item.turnDurationMs / 1000)}s`
                : ''}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'size-3 transition-transform duration-200',
            !open ? '-rotate-90' : '',
          )}
        />
      </button>
      <div className="mt-1 flex flex-wrap gap-2 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
        {item.turnStartedAt !== undefined ? (
          <span>
            {t('detail.reasoning.turnStarted', {
              value: formatDateTime(item.turnStartedAt),
            })}
          </span>
        ) : null}
        {item.turnCompletedAt !== undefined ? (
          <span>
            {t('detail.reasoning.turnCompleted', {
              value: formatDateTime(item.turnCompletedAt),
            })}
          </span>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-subtle/8 bg-secondary/6 p-3">
          {item.summary.length > 0 ? (
            <ul className="space-y-1.5 text-sm leading-6 text-foreground">
              {item.summary.map((summary, index) => (
                <li key={index}>{summary}</li>
              ))}
            </ul>
          ) : null}
          {item.content.length > 0 ? (
            <div className="space-y-2">
              {item.content.map((content, index) => (
                <div
                  className="rounded-lg bg-background/50 px-3 py-2"
                  key={index}
                >
                  {looksLikeMarkdownContent(content) ? (
                    <RichMarkdown
                      className="text-sm text-muted-foreground"
                      content={content}
                    />
                  ) : (
                    <ReasoningPreformatted content={content} />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CommandCard({
  item,
}: {
  item: Extract<ThreadItem, { type: 'commandExecution' }>;
}) {
  const { t } = useI18n();
  const displayCommand = getCommandDisplay(item.command);
  const commandExpanded = displayCommand !== item.command;
  const hasDetails = commandExpanded || item.aggregatedOutput;

  return (
    <Collapsible className="overflow-hidden rounded-xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3] lg:ml-9">
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-subtle/[0.03]"
          type="button"
        >
          <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {displayCommand}
          </span>
          {item.durationMs ? (
            <CommandMetaBadge
              label={`${Math.round(item.durationMs / 1000)}s`}
            />
          ) : null}
          {item.status === 'inProgress' || item.status === 'failed' ? (
            <StatusBadge
              label={formatExecutionStatus(item.status, t)}
              tone={item.status === 'failed' ? 'error' : 'active'}
            />
          ) : null}
          {hasDetails ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
          ) : null}
        </button>
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent>
          <div className="space-y-0">
            {commandExpanded ? (
              <div className="border-t border-subtle/4 px-3 py-2">
                <p className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-foreground/80">
                  {item.command}
                </p>
              </div>
            ) : null}
            {item.aggregatedOutput ? (
              <div className="border-t border-subtle/4 p-3">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      className="text-muted-foreground"
                      size="xs"
                      variant="ghost"
                    >
                      <ChevronDown className="mr-0.5 size-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                      {t('detail.command.output')}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pt-2">
                      <RichTerminalOutput
                        className="rounded-lg border border-subtle/8 bg-code-bg"
                        content={item.aggregatedOutput}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function FileChangeCard({
  item,
  onOpenWorkspacePath,
  resolveWorkspacePath,
}: {
  item: Extract<ThreadItem, { type: 'fileChange' }>;
  onOpenWorkspacePath: (
    path: string,
    targetKind: WorkspaceBrowserRequestedTargetKind,
  ) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-1.5 lg:ml-9">
      {item.changes.map((change, index) => (
        <div
          className="overflow-hidden rounded-xl border border-subtle/8 shadow-[inset_0_0_0_1px_var(--color-subtle)/5]"
          key={`${item.id}-${index}`}
        >
          <div className="flex items-center gap-2 bg-background/85 px-3 py-2">
            <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
              {change.path}
            </p>
            {change.kind ? (
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                {change.kind}
              </span>
            ) : null}
            {resolveWorkspacePath(change.path) ? (
              <Button
                onClick={() => {
                  const workspacePath = resolveWorkspacePath(change.path);
                  if (!workspacePath) {
                    return;
                  }
                  onOpenWorkspacePath(workspacePath, 'file');
                }}
                size="xs"
                type="button"
                variant="ghost"
              >
                {t('detail.workspace.action.openFile')}
              </Button>
            ) : null}
          </div>
          {change.diff ? (
            <Collapsible>
              <div className="border-t border-subtle/4 px-3 py-1">
                <CollapsibleTrigger asChild>
                  <Button
                    className="text-muted-foreground"
                    size="xs"
                    variant="ghost"
                  >
                    {t('detail.fileChange.showDiff')}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="border-t border-subtle/4 p-3">
                  <RichCodeBlock className="bg-code-bg" language="diff">
                    {change.diff}
                  </RichCodeBlock>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ToolLabel({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-accent/60 px-2.5 py-1.5 text-muted-foreground lg:ml-9">
      {icon}
      <span className="font-mono text-[0.7rem] uppercase tracking-wide">
        {label}:
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {value}
      </span>
    </div>
  );
}

function SystemActivityLabel({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-subtle/8 bg-background/72 px-3 py-2 text-muted-foreground lg:ml-9">
      {icon}
      <span className="font-mono text-[0.7rem] uppercase tracking-wide">
        {label}:
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {value}
      </span>
    </div>
  );
}

function ReviewResultCard({ review }: { review: string }) {
  const { t } = useI18n();

  return (
    <Collapsible className="overflow-hidden rounded-xl border border-subtle/8 bg-background/72 lg:ml-9">
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {t('detail.review.completed')}
        </p>
        <CollapsibleTrigger asChild>
          <Button className="text-muted-foreground" size="xs" variant="ghost">
            <ChevronDown className="mr-0.5 size-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
            {t('detail.review.show')}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="border-t border-subtle/4 px-3 py-3">
        <RichMarkdown content={review} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function UserInputRenderer({
  input,
  onFilePathClick,
}: {
  input: Extract<ThreadItem, { type: 'userMessage' }>['content'][number];
  onFilePathClick?: ((href: string) => void) | undefined;
}) {
  const { t } = useI18n();

  switch (input.type) {
    case 'text':
      return (
        <RichMarkdown content={input.text} onFilePathClick={onFilePathClick} />
      );
    case 'image':
      return (
        <StructuredUserInput
          label={t('detail.userInput.image')}
          value={input.url}
        />
      );
    case 'localImage':
      return (
        <StructuredUserInput
          label={t('detail.userInput.localImage')}
          value={input.path}
        />
      );
    case 'skill':
      return (
        <StructuredUserInput
          label={t('detail.userInput.skill')}
          value={`${input.name} (${input.path})`}
        />
      );
    case 'mention':
      return (
        <StructuredUserInput
          label={t('detail.userInput.mention')}
          value={`${input.name} (${input.path})`}
        />
      );
  }
}

function formatExecutionStatus(
  status: 'completed' | 'failed' | 'inProgress',
  t: (key: string) => string,
) {
  switch (status) {
    case 'completed':
      return t('turn.status.completed');
    case 'failed':
      return t('turn.status.failed');
    case 'inProgress':
      return t('turn.status.inProgress');
  }
}

function RichMarkdown({
  className,
  content,
  onFilePathClick,
}: {
  className?: string | undefined;
  content: string;
  onFilePathClick?: ((href: string) => void) | undefined;
}) {
  return (
    <Suspense
      fallback={<PlainTextFallback className={className} content={content} />}
    >
      <LazyMarkdownContent
        {...(className ? { className } : {})}
        content={content}
        onFilePathClick={onFilePathClick}
      />
    </Suspense>
  );
}

function RichCodeBlock({
  children,
  chrome = true,
  className,
  language,
  shellPrompt = false,
}: {
  children: string;
  chrome?: boolean;
  className?: string | undefined;
  language?: string | undefined;
  shellPrompt?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <PlainCodeFallback
          className={className}
          content={children}
          shellPrompt={shellPrompt}
        />
      }
    >
      <LazyCodeBlock
        chrome={chrome}
        {...(className ? { className } : {})}
        {...(language ? { language } : {})}
        shellPrompt={shellPrompt}
      >
        {children}
      </LazyCodeBlock>
    </Suspense>
  );
}

function RichTerminalOutput({
  className,
  content,
}: {
  className?: string | undefined;
  content: string;
}) {
  return (
    <Suspense
      fallback={<PlainCodeFallback className={className} content={content} />}
    >
      <LazyTerminalOutput
        {...(className ? { className } : {})}
        content={content}
      />
    </Suspense>
  );
}

function CommandMetaBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-subtle/8 bg-background/45 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </span>
  );
}

function TurnErrorBanner({ error }: { error: TurnError }) {
  const { t } = useI18n();

  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-xl border border-red-200/60 bg-red-50/60 px-3 py-2.5 dark:border-red-500/20 dark:bg-red-950/30 lg:ml-9"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          {t('detail.turn.error.label')}
        </p>
        <p className="mt-0.5 text-sm leading-6 text-red-700 dark:text-red-400">
          {error.message}
        </p>
        {error.additionalDetails ? (
          <p className="mt-1 text-xs leading-5 text-red-600/80 dark:text-red-400/60">
            {error.additionalDetails}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PlainTextFallback({
  className,
  content,
}: {
  className?: string | undefined;
  content: string;
}) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words text-sm leading-6 text-foreground',
        className,
      )}
    >
      {content}
    </div>
  );
}

function PlainCodeFallback({
  className,
  content,
  shellPrompt = false,
}: {
  className?: string | undefined;
  content: string;
  shellPrompt?: boolean;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]',
        className,
      )}
    >
      <pre
        className={cn(
          'm-0 overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-[0.8rem] leading-[1.65] text-foreground',
          shellPrompt ? 'pl-8' : '',
        )}
      >
        {shellPrompt ? `$ ${content}` : content}
      </pre>
    </div>
  );
}

function ReasoningPreformatted({ content }: { content: string }) {
  return (
    <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-muted-foreground">
      {content}
    </pre>
  );
}

function StructuredUserInput({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-subtle/8 bg-background/45 px-3 py-2.5">
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-sm leading-6 text-foreground">
        {value}
      </p>
    </div>
  );
}
