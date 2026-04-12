import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowLeft,
  Brain,
  ChevronDown,
  ExternalLink,
  FileCode2,
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
import { Textarea } from "@/components/ui/textarea";
import { PendingRequestList } from "@/features/requests/components/pending-request-list";
import type { PendingRequestEntry } from "@/features/requests/lib/request-utils";
import { useRequestDrafts } from "@/features/requests/lib/use-request-drafts";
import { useAutoScroll } from "@/features/threads/lib/use-auto-scroll";
import {
  buildThreadTitle,
  flattenTurnItems,
  formatStatusLabel
} from "@/features/threads/lib/thread-utils";
import type { FlatThreadItem } from "@/features/threads/lib/thread-utils";
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
  if (detailState.kind === "idle") {
    return (
      <EmptyDetailState
        isDesktop={isDesktop}
        message="Select a thread to read the conversation."
        title="No thread selected"
      />
    );
  }

  if (detailState.kind === "loading") {
    return (
      <Card className="min-h-[68svh] bg-card/65 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
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
      <Card className="min-h-[68svh] bg-destructive/6 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
        <CardContent className="space-y-4 pt-5">
          {!isDesktop ? (
            <Button onClick={onBack} size="sm" variant="ghost">
              <ArrowLeft className="size-4" />
              Back to threads
            </Button>
          ) : null}
          <Alert className="border-destructive/20 bg-transparent">
            <AlertTitle>Unable to load thread detail</AlertTitle>
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
  const [composerText, setComposerText] = useState("");
  const drafts = useRequestDrafts();
  const activeTurnId = findActiveTurnId(thread);
  const actionsEnabled = connectionState.kind === "authenticated";
  const banner = useDeferredBanner(connectionState);
  const pendingEntries: PendingRequestEntry[] = thread.pendingRequests.map((request) => ({
    request,
    thread
  }));
  const flatItems = flattenTurnItems(thread.turns);
  const scrollRef = useAutoScroll<HTMLDivElement>([flatItems.length, thread.updatedAt]);

  return (
    <Card className="flex h-full flex-col overflow-hidden bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.3)]">
      {/* Header */}
      <div className="shrink-0 border-b border-white/6 bg-background/35 px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            {!isDesktop ? (
              <Button onClick={onBack} size="icon-sm" variant="ghost">
                <ArrowLeft className="size-4" />
                <span className="sr-only">Back to threads</span>
              </Button>
            ) : null}
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-heading text-[1.1rem] tracking-[-0.04em] md:max-w-[34rem] md:text-[1.32rem] lg:max-w-[42rem] xl:max-w-[48rem]">
                  {buildThreadTitle(thread)}
                </h2>
                <div className="shrink-0">
                  <StatusBadge label={formatStatusLabel(thread.status)} />
                </div>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground md:text-sm">
                {thread.cwd}
              </p>
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
            <Badge className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
              {thread.modelProvider}
            </Badge>
          </div>
        </div>

        {thread.pendingRequests.length > 0 ? (
          <div className="mt-3">
            <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
              {thread.pendingRequests.length} pending request{thread.pendingRequests.length > 1 ? "s" : ""}
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
            <AlertTitle>Latest client error</AlertTitle>
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {/* Pending requests */}
      {pendingEntries.length > 0 ? (
        <div className="shrink-0 space-y-3 border-b border-white/6 px-4 py-4 md:px-5">
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
            isDesktop={isDesktop}
            message="Send the first message to start the conversation."
            title="No messages yet"
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 pb-4">
            {flatItems.map((item) => (
              <FlatItemRenderer key={`${item.turnId}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-white/6 bg-background/82 px-4 py-3 backdrop-blur-xl md:px-5">
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
            placeholder="Send a message"
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
              <span className="sr-only">Stop</span>
            </Button>
          ) : (
            <Button
              className="size-10 shrink-0"
              disabled={!actionsEnabled || sendMessagePending || composerText.trim().length === 0}
              size="icon"
              type="submit"
            >
              <Send className="size-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </form>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Flat item renderer
// ---------------------------------------------------------------------------

function FlatItemRenderer({ item }: { item: FlatThreadItem }) {
  switch (item.type) {
    case "userMessage":
      return (
        <UserMessageBubble>
          {item.content.map((input, index) => (
            <UserInputRenderer input={input} key={`${item.id}-${index}`} />
          ))}
        </UserMessageBubble>
      );
    case "agentMessage":
      return (
        <AgentMessageBlock>
          {item.text ? (
            <RichMarkdown content={item.text} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">No text returned.</p>
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
      return <FileChangeCard item={item} />;
    case "webSearch":
      return (
        <ToolLabel icon={<Search className="size-3" />} label="Web search" value={item.query} />
      );
    case "imageView":
      return (
        <ToolLabel icon={<GalleryHorizontal className="size-3" />} label="Image" value={item.path} />
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
              <RichCodeBlock className="bg-black/35" language="json">
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
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/12 px-4 py-3">
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
        <span>Thinking...</span>
        <ChevronDown className={cn("size-3 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-white/8 bg-secondary/6 p-3">
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
  const displayCommand = getCommandDisplay(item.command);

  return (
    <div className="lg:ml-9 overflow-hidden rounded-xl border border-white/8 bg-[linear-gradient(180deg,rgba(12,14,18,0.94),rgba(9,10,13,0.98))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {displayCommand}
        </span>
        {item.durationMs ? (
          <CommandMetaBadge label={`${Math.round(item.durationMs / 1000)}s`} />
        ) : null}
        {item.status === "inProgress" || item.status === "failed" ? (
          <StatusBadge label={item.status} />
        ) : null}
      </div>
      {item.aggregatedOutput ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <div className="border-t border-white/4 px-3 py-1.5">
              <Button size="xs" variant="ghost" className="text-muted-foreground">
                Show output
              </Button>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-white/4 p-3">
              <RichTerminalOutput
                className="rounded-lg border border-white/8 bg-black/50"
                content={item.aggregatedOutput}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function FileChangeCard({ item }: { item: Extract<ThreadItem, { type: "fileChange" }> }) {
  return (
    <div className="ml-9 space-y-1.5">
      {item.changes.map((change, index) => (
        <div
          className="overflow-hidden rounded-xl border border-white/8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
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
          </div>
          {change.diff ? (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <div className="border-t border-white/4 px-3 py-1">
                  <Button size="xs" variant="ghost" className="text-muted-foreground">
                    Show diff
                  </Button>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-white/4 p-3">
                  <RichCodeBlock className="bg-black/45" language="diff">
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
    <div className="ml-9 flex items-center gap-1.5 rounded-lg bg-accent/60 px-2.5 py-1.5 text-muted-foreground">
      {icon}
      <span className="font-mono text-[0.7rem] uppercase tracking-wide">{label}:</span>
      <span className="truncate text-xs text-foreground">{value}</span>
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
  if (threadsState.kind !== "ready") {
    return null;
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon-sm" variant="outline">
          <PanelLeftOpen className="size-4" />
          <span className="sr-only">Open thread switcher</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="max-w-sm border-l border-white/6 bg-card/95" side="right">
        <SheetHeader>
          <SheetTitle>Switch thread</SheetTitle>
          <SheetDescription>
            Jump straight into another workspace without losing your current route.
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[calc(100svh-7rem)] space-y-2 overflow-y-auto px-4 pb-4">
          {threadsState.threads.map((thread) => (
            <Button
              className={cn(
                "h-auto w-full justify-start rounded-[12px] border border-white/8 bg-card/76 px-4 py-3 text-left",
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
                  {buildThreadTitle(thread)}
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
  isDesktop,
  message,
  title
}: {
  isDesktop: boolean;
  message: string;
  title: string;
}) {
  return (
    <Card className="min-h-[68svh] bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
      <CardContent className={cn("grid min-h-[68svh] place-items-center p-6", !isDesktop && "min-h-[60svh]")}>
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

function StatusBadge({ label }: { label: string }) {
  const classes =
    label === "Waiting approval"
      ? "bg-secondary/16 text-secondary pulse-secondary"
      : label === "Waiting input"
        ? "bg-primary/12 text-primary"
        : label === "Active" || label === "completed"
          ? "bg-primary/12 text-primary"
          : label === "inProgress"
            ? "bg-primary/12 text-primary"
            : label === "failed" || label === "System error"
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

function useDeferredBanner(connectionState: LocalConnectionState) {
  const [visibleBanner, setVisibleBanner] = useState<ReturnType<typeof connectionBanner>>(null);

  useEffect(() => {
    const next = connectionBanner(connectionState);
    if (!next) {
      setVisibleBanner(null);
      return;
    }
    const timer = setTimeout(() => {
      setVisibleBanner(connectionBanner(connectionState));
    }, BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [connectionState.kind]);

  return visibleBanner;
}

function connectionBanner(
  connectionState: LocalConnectionState
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
        title: "Refreshing bridge session",
        message: "The client is rotating credentials before continuing live updates.",
        tone: "info"
      };
    case "reconnecting":
      return {
        title: "Reconnecting",
        message: connectionState.message ?? "Bridge connectivity dropped and recovery is in progress.",
        tone: "info"
      };
    case "resyncing":
      return {
        title: "Resyncing from bridge authority",
        message: "The thread view is catching up to the bridge after reconnect or refresh.",
        tone: "info"
      };
    case "disconnected":
      return {
        title: "Showing last known thread state",
        message: connectionState.message ?? "Bridge is unavailable right now.",
        tone: "error"
      };
    case "revoked":
      return {
        title: "Trusted device revoked",
        message: connectionState.message ?? "This browser can no longer issue authenticated actions.",
        tone: "error"
      };
    case "expired":
      return {
        title: "Session expired",
        message: connectionState.message ?? "Re-pair this browser to restore bridge access.",
        tone: "error"
      };
    case "unpaired":
      return {
        title: "Pairing required",
        message: "Pair this browser from the Connection page before interacting with threads.",
        tone: "error"
      };
  }
}

function UserInputRenderer({
  input
}: {
  input: Extract<ThreadItem, { type: "userMessage" }>["content"][number];
}) {
  switch (input.type) {
    case "text":
      return <RichMarkdown content={input.text} />;
    case "image":
      return <StructuredUserInput label="Image" value={input.url} />;
    case "localImage":
      return <StructuredUserInput label="Local image" value={input.path} />;
    case "skill":
      return <StructuredUserInput label="Skill" value={`${input.name} (${input.path})`} />;
    case "mention":
      return <StructuredUserInput label="Mention" value={`${input.name} (${input.path})`} />;
  }
}

function RichMarkdown({
  className,
  content
}: {
  className?: string | undefined;
  content: string;
}) {
  return (
    <Suspense fallback={<PlainTextFallback className={className} content={content} />}>
      <LazyMarkdownContent {...(className ? { className } : {})} content={content} />
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
    <span className="rounded-md border border-white/8 bg-background/45 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
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
        "overflow-hidden rounded-2xl border border-white/8 bg-[#111317] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
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
    <div className="rounded-xl border border-white/8 bg-background/45 px-3 py-2.5">
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-sm leading-6 text-foreground">{value}</p>
    </div>
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
