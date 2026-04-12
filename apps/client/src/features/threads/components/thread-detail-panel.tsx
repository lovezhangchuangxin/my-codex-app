import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileCode2,
  FolderOpen,
  GalleryHorizontal,
  PanelLeftOpen,
  Search,
  Send,
  Sparkles,
  Square,
  SquareTerminal
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { PendingRequestList } from "@/features/requests/components/pending-request-list";
import type { PendingRequestEntry } from "@/features/requests/lib/request-utils";
import { useRequestDrafts } from "@/features/requests/lib/use-request-drafts";
import { WorkspaceBrowserSheet } from "@/features/threads/components/workspace-browser-sheet";
import { useAutoScroll } from "@/features/threads/lib/use-auto-scroll";
import {
  buildThreadTitle,
  flattenTurnItems,
  formatStatusLabel,
  getStatusTone
} from "@/features/threads/lib/thread-utils";
import type { FlatThreadItem } from "@/features/threads/lib/thread-utils";
import { toWorkspaceRelativePath } from "@/features/threads/lib/workspace-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { ThreadDetailState, ThreadListState } from "@my-codex-app/sdk";
import { findActiveTurnId } from "@my-codex-app/sdk";
import type {
  LocalConnectionState,
  RequestRespondRequest,
  ThreadDetail,
  ThreadItem
} from "@my-codex-app/protocol";

const LazyMarkdownContent = lazy(async () => {
  const module = await import("@/components/common/markdown-content");
  return { default: module.MarkdownContent };
});

const LazyCodeBlock = lazy(async () => {
  const module = await import("@/components/common/code-block");
  return { default: module.CodeBlock };
});

const LazyTerminalOutput = lazy(async () => {
  const module = await import("@/components/common/terminal-output");
  return { default: module.TerminalOutput };
});

// ---------------------------------------------------------------------------
// Entry: ThreadDetailPanel
// ---------------------------------------------------------------------------

export function ThreadDetailPanel({
  connectionState,
  detailState,
  highlightedRequestKey,
  interruptPending,
  isDesktop,
  lastError,
  onBack,
  onOpenThread,
  onRespondToRequest,
  onSendMessage,
  onInterrupt,
  respondingRequestIds,
  selectedThreadId,
  sendMessagePending,
  threadsState
}: {
  connectionState: LocalConnectionState;
  detailState: ThreadDetailState;
  highlightedRequestKey: string | null | undefined;
  interruptPending: boolean;
  isDesktop: boolean;
  lastError: string | null;
  onBack: () => void;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  onSendMessage: (threadId: string, text: string) => Promise<boolean>;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  respondingRequestIds: Array<string | number>;
  selectedThreadId: string | null;
  sendMessagePending: boolean;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();

  if (detailState.kind === "idle") {
    return (
      <EmptyDetailState
        message={t("detail.empty.noThread.message")}
        title={t("detail.empty.noThread.title")}
      />
    );
  }

  if (detailState.kind === "loading") {
    return (
      <Card className="h-full rounded-none bg-card/65">
        <CardContent className="space-y-4 pt-5">
          <div className="h-10 w-48 rounded-full bg-muted/70" />
          <div className="h-5 w-full rounded-full bg-muted/70" />
          <div className="h-5 w-5/6 rounded-full bg-muted/70" />
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="h-24 rounded-[18px] border border-border/60 bg-background/70" key={index} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (detailState.kind === "error") {
    return (
      <Card className="h-full rounded-none bg-destructive/6">
        <CardContent className="space-y-4 pt-5">
          {!isDesktop ? (
            <Button onClick={onBack} size="sm" variant="ghost">
              <ArrowLeft className="size-4" />
              {t("detail.action.backToThreads")}
            </Button>
          ) : null}
          <Alert className="border-destructive/20 bg-transparent">
            <AlertTitle>{t("detail.error.loadTitle")}</AlertTitle>
            <AlertDescription>{detailState.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <ReadyThreadDetail
      connectionState={connectionState}
      key={detailState.thread.id}
      highlightedRequestKey={highlightedRequestKey}
      interruptPending={interruptPending}
      isDesktop={isDesktop}
      lastError={lastError}
      onBack={onBack}
      onOpenThread={onOpenThread}
      onRespondToRequest={onRespondToRequest}
      onSendMessage={onSendMessage}
      onInterrupt={onInterrupt}
      respondingRequestIds={respondingRequestIds}
      selectedThreadId={selectedThreadId}
      sendMessagePending={sendMessagePending}
      thread={detailState.thread}
      threadsState={threadsState}
    />
  );
}

// ---------------------------------------------------------------------------
// Main: ReadyThreadDetail
// ---------------------------------------------------------------------------

function ReadyThreadDetail({
  connectionState,
  highlightedRequestKey,
  interruptPending,
  isDesktop,
  lastError,
  onBack,
  onOpenThread,
  onRespondToRequest,
  onSendMessage,
  onInterrupt,
  respondingRequestIds,
  selectedThreadId,
  sendMessagePending,
  thread,
  threadsState
}: {
  connectionState: LocalConnectionState;
  highlightedRequestKey: string | null | undefined;
  interruptPending: boolean;
  isDesktop: boolean;
  lastError: string | null;
  onBack: () => void;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  onSendMessage: (threadId: string, text: string) => Promise<boolean>;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  respondingRequestIds: Array<string | number>;
  selectedThreadId: string | null;
  sendMessagePending: boolean;
  thread: ThreadDetail;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();
  const [composerText, setComposerText] = useState("");
  const drafts = useRequestDrafts();
  const activeTurnId = findActiveTurnId(thread);
  const actionsEnabled = connectionState.kind === "authenticated";
  const banner = useDeferredBanner(connectionState, t);
  const pendingEntries: PendingRequestEntry[] = thread.pendingRequests.map((request) => ({
    request,
    thread
  }));
  const flatItems = flattenTurnItems(thread.turns);
  const scrollRef = useAutoScroll<HTMLDivElement>([flatItems.length, thread.updatedAt]);
  const [workspaceBrowserState, setWorkspaceBrowserState] = useState<{
    open: boolean;
    requestedPath: string | null;
    requestedLine: number | null;
    requestKey: number;
  }>({
    open: false,
    requestedPath: null,
    requestedLine: null,
    requestKey: 0
  });

  function resolveWorkspacePath(candidatePath: string): string | null {
    return toWorkspaceRelativePath(thread.cwd, candidatePath);
  }

  function openWorkspaceBrowser(requestedPath: string | null = null, requestedLine: number | null = null) {
    setWorkspaceBrowserState((current) => ({
      open: true,
      requestedPath,
      requestedLine,
      requestKey: current.requestKey + 1
    }));
  }

  const handleFilePathClick = useCallback((href: string) => {
    const { path, line } = parseFilePathWithLine(href);
    const workspacePath = toWorkspaceRelativePath(thread.cwd, path);
    if (workspacePath) {
      setWorkspaceBrowserState((current) => ({
        open: true,
        requestedPath: workspacePath,
        requestedLine: line,
        requestKey: current.requestKey + 1
      }));
    }
  }, [thread.cwd]);

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-none bg-card/68 py-0 gap-0">
      {/* Header */}
      <div className="shrink-0 border-b border-subtle/6 bg-background/35 px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            {!isDesktop ? (
              <Button onClick={onBack} size="icon-sm" variant="ghost">
                <ArrowLeft className="size-4" />
                <span className="sr-only">{t("detail.action.backToThreads")}</span>
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
              <MobileThreadSwitcher
                onOpenThread={onOpenThread}
                selectedThreadId={selectedThreadId}
                threadsState={threadsState}
              />
            ) : null}
            <Button
              onClick={() => {
                openWorkspaceBrowser();
              }}
              size="sm"
              variant="outline"
            >
              <FolderOpen className="size-3.5" />
              {t("detail.workspace.open")}
            </Button>
            <Badge className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
              {thread.modelProvider}
            </Badge>
          </div>
        </div>

        {thread.pendingRequests.length > 0 ? (
          <div className="mt-3">
            <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
              {t("detail.badge.pendingRequests", {
                count: thread.pendingRequests.length
              })}
            </Badge>
          </div>
        ) : null}
      </div>

      {/* Connection / error banners */}
      {banner ? (
        <div className="shrink-0 px-4 pt-3 md:px-5">
          <Alert className={banner.tone === "error" ? "border-destructive/20 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
            <AlertTitle>{banner.title}</AlertTitle>
            <AlertDescription>{banner.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {lastError ? (
        <div className="shrink-0 px-4 pt-3 md:px-5">
          <Alert className="border-destructive/20 bg-destructive/5">
            <AlertTitle>{t("detail.alert.latestClientError")}</AlertTitle>
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {/* Pending requests */}
      {pendingEntries.length > 0 ? (
        <div className="shrink-0 space-y-3 border-b border-subtle/6 px-4 py-4 md:px-5">
          <PendingRequestList
            entries={pendingEntries}
            getDraft={drafts.getDraft}
            highlightedRequestKey={highlightedRequestKey}
            onOpenThread={onOpenThread}
            onRespondToRequest={async (request) => {
              const resolved = await onRespondToRequest(request);
              if (resolved) {
                drafts.clearRequest(request.requestId);
              }
              return resolved;
            }}
            respondingRequestIds={respondingRequestIds}
            setDraft={drafts.setDraft}
            showThreadContext={false}
          />
        </div>
      ) : null}

      {/* Message stream */}
      <div
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-4 md:px-5"
        ref={scrollRef}
      >
        {flatItems.length === 0 ? (
          <EmptyDetailState
            message={t("detail.empty.noMessages.message")}
            title={t("detail.empty.noMessages.title")}
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 pb-4">
            {flatItems.map((item) => (
              <FlatItemRenderer
                item={item}
                key={`${item.turnId}-${item.id}`}
                onFilePathClick={handleFilePathClick}
                onOpenWorkspacePath={(path) => {
                  openWorkspaceBrowser(path);
                }}
                resolveWorkspacePath={resolveWorkspacePath}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-subtle/6 bg-background/82 px-4 py-3 backdrop-blur-xl md:px-5">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (thread.id.length === 0) return;

            void (async () => {
              const sent = await onSendMessage(thread.id, composerText);
              if (sent) {
                setComposerText("");
              }
            })();
          }}
        >
          <Textarea
            autoFocus
            className="min-h-[42px] flex-1 resize-none border-0 bg-accent/82 font-mono text-sm leading-6 transition-shadow duration-200 placeholder:text-muted-foreground/45 focus-visible:ring-1 focus-visible:ring-primary/40"
            id="thread-composer"
            onChange={(event) => {
              setComposerText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (!isDesktop) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={t("detail.composer.placeholder")}
            rows={1}
            value={composerText}
          />
          {activeTurnId ? (
            <Button
              className="size-10 shrink-0"
              disabled={!actionsEnabled || interruptPending}
              onClick={() => {
                void onInterrupt(thread.id, activeTurnId);
              }}
              size="icon"
              type="button"
              variant="outline"
            >
              <Square className="size-4" />
              <span className="sr-only">{t("detail.action.stop")}</span>
            </Button>
          ) : (
            <Button
              className="size-10 shrink-0"
              disabled={!actionsEnabled || sendMessagePending || composerText.trim().length === 0}
              size="icon"
              type="submit"
            >
              <Send className="size-4" />
              <span className="sr-only">{t("detail.action.send")}</span>
            </Button>
          )}
        </form>
      </div>

      <WorkspaceBrowserSheet
        cwd={thread.cwd}
        onOpenChange={(nextOpen) => {
          setWorkspaceBrowserState((current) => ({
            ...current,
            open: nextOpen
          }));
        }}
        open={workspaceBrowserState.open}
        requestKey={workspaceBrowserState.requestKey}
        requestedLine={workspaceBrowserState.requestedLine}
        requestedPath={workspaceBrowserState.requestedPath}
        threadId={thread.id}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Flat item renderer
// ---------------------------------------------------------------------------

function FlatItemRenderer({
  item,
  onFilePathClick,
  onOpenWorkspacePath,
  resolveWorkspacePath
}: {
  item: FlatThreadItem;
  onFilePathClick?: ((href: string) => void) | undefined;
  onOpenWorkspacePath: (path: string) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
}) {
  const { t } = useI18n();

  switch (item.type) {
    case "userMessage":
      return (
        <UserMessageBubble>
          {item.content.map((input, index) => (
            <UserInputRenderer input={input} key={`${item.id}-${index}`} onFilePathClick={onFilePathClick} />
          ))}
        </UserMessageBubble>
      );
    case "agentMessage":
      return (
        <AgentMessageBlock>
          {item.text ? (
            <RichMarkdown content={item.text} onFilePathClick={onFilePathClick} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {t("detail.agent.noTextReturned")}
            </p>
          )}
        </AgentMessageBlock>
      );
    case "reasoning":
      if (item.summary.length === 0 && item.content.length === 0) {
        return null;
      }
      return <ThinkingBlock item={item} />;
    case "commandExecution":
      return <CommandCard item={item} />;
    case "fileChange":
      return (
        <FileChangeCard
          item={item}
          onOpenWorkspacePath={onOpenWorkspacePath}
          resolveWorkspacePath={resolveWorkspacePath}
        />
      );
    case "webSearch":
      return (
        <ToolLabel
          icon={<Search className="size-3" />}
          label={t("detail.tool.webSearch")}
          value={item.query}
        />
      );
    case "imageView":
      return (
        <ToolLabel
          icon={<GalleryHorizontal className="size-3" />}
          label={t("detail.tool.image")}
          value={item.path}
        />
      );
    case "unknown":
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
}

// ---------------------------------------------------------------------------
// Message components
// ---------------------------------------------------------------------------

function UserMessageBubble({ children }: { children: import("react").ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-subtle/[0.06] px-4 py-3">
        <div className="space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

function AgentMessageBlock({ children }: { children: import("react").ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="hidden lg:flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/12">
        <img src="/openai.svg" alt="" className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}

function ThinkingBlock({ item }: { item: Extract<ThreadItem, { type: "reasoning" }> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:ml-9">
      <button
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[0.8rem] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Brain className="size-3.5" />
        <span>{t("detail.reasoning.thinking")}</span>
        <ChevronDown className={cn("size-3 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
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
                <div key={index} className="rounded-lg bg-background/50 px-3 py-2">
                  {looksLikeMarkdownContent(content) ? (
                    <RichMarkdown className="text-sm text-muted-foreground" content={content} />
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

function CommandCard({ item }: { item: Extract<ThreadItem, { type: "commandExecution" }> }) {
  const { t } = useI18n();
  const displayCommand = getCommandDisplay(item.command);
  const commandExpanded = displayCommand !== item.command;
  const hasDetails = commandExpanded || item.aggregatedOutput;

  return (
    <Collapsible className="lg:ml-9 overflow-hidden rounded-xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]">
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
            <CommandMetaBadge label={`${Math.round(item.durationMs / 1000)}s`} />
          ) : null}
          {item.status === "inProgress" || item.status === "failed" ? (
            <StatusBadge
              label={formatExecutionStatus(item.status, t)}
              tone={item.status === "failed" ? "error" : "active"}
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
                    <Button size="xs" variant="ghost" className="text-muted-foreground">
                      <ChevronDown className="mr-0.5 size-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                      {t("detail.command.output")}
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
  resolveWorkspacePath
}: {
  item: Extract<ThreadItem, { type: "fileChange" }>;
  onOpenWorkspacePath: (path: string) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="lg:ml-9 space-y-1.5">
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
                  onOpenWorkspacePath(workspacePath);
                }}
                size="xs"
                type="button"
                variant="ghost"
              >
                {t("detail.workspace.action.openFile")}
              </Button>
            ) : null}
          </div>
          {change.diff ? (
            <Collapsible>
              <div className="border-t border-subtle/4 px-3 py-1">
                <CollapsibleTrigger asChild>
                  <Button size="xs" variant="ghost" className="text-muted-foreground">
                    {t("detail.fileChange.showDiff")}
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

function ToolLabel({ icon, label, value }: { icon: import("react").ReactNode; label: string; value: string }) {
  return (
    <div className="lg:ml-9 flex items-center gap-1.5 rounded-lg bg-accent/60 px-2.5 py-1.5 text-muted-foreground">
      {icon}
      <span className="font-mono text-[0.7rem] uppercase tracking-wide">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile thread switcher
// ---------------------------------------------------------------------------

function MobileThreadSwitcher({
  onOpenThread,
  selectedThreadId,
  threadsState
}: {
  onOpenThread: (threadId: string) => void;
  selectedThreadId: string | null;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();

  if (threadsState.kind !== "ready") {
    return null;
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon-sm" variant="outline">
          <PanelLeftOpen className="size-4" />
          <span className="sr-only">{t("detail.switcher.open")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="max-w-sm border-l border-subtle/6 bg-card/95" side="right">
        <SheetHeader>
          <SheetTitle>{t("detail.switcher.title")}</SheetTitle>
          <SheetDescription>
            {t("detail.switcher.description")}
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[calc(100svh-7rem)] space-y-2 overflow-y-auto px-4 pb-4">
          {threadsState.threads.map((thread) => (
            <Button
              className={cn(
                "h-auto w-full justify-start rounded-[12px] border border-subtle/8 bg-card/76 px-4 py-3 text-left",
                selectedThreadId === thread.id &&
                  "border-primary/20 bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.14)]"
              )}
              key={thread.id}
              onClick={() => {
                onOpenThread(thread.id);
              }}
              variant="ghost"
            >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {buildThreadTitle(thread, t)}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {thread.cwd}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function EmptyDetailState({
  message,
  title
}: {
  message: string;
  title: string;
}) {
  return (
    <Card className="h-full rounded-none bg-card/68">
      <CardContent className="grid h-full place-items-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Sparkles className="size-6" />
          </div>
          <h2 className="font-heading text-2xl tracking-[-0.04em]">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  label,
  tone
}: {
  label: string;
  tone: "active" | "error" | "neutral" | "waitingApproval" | "waitingInput";
}) {
  const classes =
    tone === "waitingApproval"
      ? "bg-secondary/16 text-secondary pulse-secondary"
      : tone === "waitingInput"
        ? "bg-primary/12 text-primary"
        : tone === "active"
          ? "bg-primary/12 text-primary"
          : tone === "error"
            ? "bg-destructive/12 text-destructive"
            : "bg-background/70 text-muted-foreground";

  return (
    <Badge className={cn("border-0 font-mono text-[0.7rem] uppercase", classes)} variant="secondary">
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BANNER_DELAY_MS = 1500;

function useDeferredBanner(
  connectionState: LocalConnectionState,
  t: (key: string) => string
) {
  const [visibleBanner, setVisibleBanner] = useState<ReturnType<typeof connectionBanner>>(null);

  useEffect(() => {
    const next = connectionBanner(connectionState, t);
    if (!next) {
      setVisibleBanner(null);
      return;
    }
    const timer = setTimeout(() => {
      setVisibleBanner(connectionBanner(connectionState, t));
    }, BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [connectionState.kind, connectionState.message, t]);

  return visibleBanner;
}

function connectionBanner(
  connectionState: LocalConnectionState,
  t: (key: string) => string
):
  | {
      message: string;
      title: string;
      tone: "info" | "error";
    }
  | null {
  switch (connectionState.kind) {
    case "authenticated":
      return null;
    case "refreshing":
      return {
        title: t("detail.banner.refreshing.title"),
        message: t("detail.banner.refreshing.message"),
        tone: "info"
      };
    case "reconnecting":
      return {
        title: t("detail.banner.reconnecting.title"),
        message: connectionState.message ?? t("detail.banner.reconnecting.message"),
        tone: "info"
      };
    case "resyncing":
      return {
        title: t("detail.banner.resyncing.title"),
        message: t("detail.banner.resyncing.message"),
        tone: "info"
      };
    case "disconnected":
      return {
        title: t("detail.banner.disconnected.title"),
        message: connectionState.message ?? t("detail.banner.disconnected.message"),
        tone: "error"
      };
    case "revoked":
      return {
        title: t("detail.banner.revoked.title"),
        message: connectionState.message ?? t("detail.banner.revoked.message"),
        tone: "error"
      };
    case "expired":
      return {
        title: t("detail.banner.expired.title"),
        message: connectionState.message ?? t("detail.banner.expired.message"),
        tone: "error"
      };
    case "unpaired":
      return {
        title: t("detail.banner.unpaired.title"),
        message: t("detail.banner.unpaired.message"),
        tone: "error"
      };
  }
}

function UserInputRenderer({
  input,
  onFilePathClick
}: {
  input: Extract<ThreadItem, { type: "userMessage" }>["content"][number];
  onFilePathClick?: ((href: string) => void) | undefined;
}) {
  const { t } = useI18n();

  switch (input.type) {
    case "text":
      return <RichMarkdown content={input.text} onFilePathClick={onFilePathClick} />;
    case "image":
      return <StructuredUserInput label={t("detail.userInput.image")} value={input.url} />;
    case "localImage":
      return <StructuredUserInput label={t("detail.userInput.localImage")} value={input.path} />;
    case "skill":
      return <StructuredUserInput label={t("detail.userInput.skill")} value={`${input.name} (${input.path})`} />;
    case "mention":
      return <StructuredUserInput label={t("detail.userInput.mention")} value={`${input.name} (${input.path})`} />;
  }
}

function formatExecutionStatus(
  status: "completed" | "failed" | "inProgress",
  t: (key: string) => string
) {
  switch (status) {
    case "completed":
      return t("turn.status.completed");
    case "failed":
      return t("turn.status.failed");
    case "inProgress":
      return t("turn.status.inProgress");
  }
}

function RichMarkdown({
  className,
  content,
  onFilePathClick
}: {
  className?: string | undefined;
  content: string;
  onFilePathClick?: ((href: string) => void) | undefined;
}) {
  return (
    <Suspense fallback={<PlainTextFallback className={className} content={content} />}>
      <LazyMarkdownContent {...(className ? { className } : {})} content={content} onFilePathClick={onFilePathClick} />
    </Suspense>
  );
}

function RichCodeBlock({
  children,
  chrome = true,
  className,
  language,
  shellPrompt = false
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
        <PlainCodeFallback className={className} content={children} shellPrompt={shellPrompt} />
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
  content
}: {
  className?: string | undefined;
  content: string;
}) {
  return (
    <Suspense fallback={<PlainCodeFallback className={className} content={content} />}>
      <LazyTerminalOutput {...(className ? { className } : {})} content={content} />
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

function PlainTextFallback({
  className,
  content
}: {
  className?: string | undefined;
  content: string;
}) {
  return (
    <div className={cn("whitespace-pre-wrap break-words text-sm leading-6 text-foreground", className)}>
      {content}
    </div>
  );
}

function PlainCodeFallback({
  className,
  content,
  shellPrompt = false
}: {
  className?: string | undefined;
  content: string;
  shellPrompt?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]",
        className
      )}
    >
      <pre
        className={cn(
          "m-0 overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-[0.8rem] leading-[1.65] text-foreground",
          shellPrompt && "pl-8"
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
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-subtle/8 bg-background/45 px-3 py-2.5">
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function CopyPathButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="shrink-0 rounded-md p-1 text-popover-foreground/50 transition-colors hover:bg-subtle/10 hover:text-popover-foreground"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      type="button"
    >
      {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
    </button>
  );
}

function CwdPathDisplay({ cwd }: { cwd: string }) {
  const displayName = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() || cwd : cwd;
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
      <PopoverContent align="start" className="w-auto max-w-sm flex-row items-center gap-2 p-2.5">
        <p className="min-w-0 break-all font-mono text-[0.7rem] leading-relaxed">
          {cwd}
        </p>
        <CopyPathButton value={cwd} />
      </PopoverContent>
    </Popover>
  );
}

function looksLikeMarkdownContent(content: string) {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return false;
  }

  return (
    /^#{1,6}\s/m.test(trimmed) ||
    /^>\s/m.test(trimmed) ||
    /^```/m.test(trimmed) ||
    /^\s*[-*+]\s/m.test(trimmed) ||
    /^\s*\d+\.\s/m.test(trimmed) ||
    /\[[^\]]+\]\([^)]+\)/.test(trimmed) ||
    /\|.+\|/.test(trimmed)
  );
}

function parseFilePathWithLine(href: string): { path: string; line: number | null } {
  const match = href.match(/^(.+?)#L(\d+)$/i);
  if (match?.[1] != null && match[2] != null) {
    return { path: match[1], line: parseInt(match[2], 10) };
  }
  return { path: href, line: null };
}

function getCommandDisplay(command: string): string {
  const trimmed = command.trim();
  const wrappedCommandMatch =
    /^(?<shell>(?:\/bin\/|\/usr\/bin\/)?(?:bash|zsh|sh))\s+(?<flags>-[A-Za-z]+(?:\s+-[A-Za-z]+)*)\s+(?<body>[\s\S]+)$/u.exec(
      trimmed
    );

  if (!wrappedCommandMatch?.groups) {
    return command;
  }

  const { body, flags } = wrappedCommandMatch.groups;
  if (!body || !flags || !flags.includes("c")) {
    return command;
  }

  const unwrappedBody = unwrapShellCommandBody(body);
  if (!unwrappedBody || unwrappedBody === trimmed) {
    return command;
  }

  return unwrappedBody;
}


function unwrapShellCommandBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length < 2) {
    return null;
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/'\\''/g, "'");
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  return trimmed;
}
