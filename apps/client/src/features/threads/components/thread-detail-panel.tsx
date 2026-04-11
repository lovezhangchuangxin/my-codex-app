import { lazy, Suspense, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Brain,
  ExternalLink,
  FileCode2,
  GalleryHorizontal,
  PanelLeftOpen,
  Search,
  Sparkles,
  SquareTerminal,
  UserRound
} from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  buildThreadTitle,
  formatRelativeTime,
  formatStatusLabel,
  formatTimestamp,
  getWorkspaceLabel
} from "@/features/threads/lib/thread-utils";
import { cn } from "@/lib/utils";
import type { ThreadDetailState, ThreadListState } from "@my-codex-app/sdk";
import { findActiveTurnId } from "@my-codex-app/sdk";
import type {
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

export function ThreadDetailPanel({
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
        message="Select a thread to read its full turn timeline, approvals, and streamed output."
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

function ReadyThreadDetail({
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
  const pendingEntries: PendingRequestEntry[] = thread.pendingRequests.map((request) => ({
    request,
    thread
  }));
  const orderedTurns = [...thread.turns].reverse();
  const defaultOpenTurn = activeTurnId ?? orderedTurns[0]?.id;
  const accordionDefaultValue = defaultOpenTurn
    ? { defaultValue: defaultOpenTurn }
    : {};

  return (
    <Card className="min-h-[68svh] overflow-hidden bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.3)]">
      <div className="border-b border-white/6 bg-background/35 px-4 py-3.5 md:px-5">
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
            <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
              {thread.modelProvider}
            </Badge>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
            {getWorkspaceLabel(thread.cwd)}
          </Badge>
          {thread.pendingRequests.length > 0 ? (
            <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
              {thread.pendingRequests.length} pending
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-[12px] border border-white/8 bg-background/38 px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
          <span>
            Turns <span className="ml-1 text-foreground">{thread.turns.length}</span>
          </span>
          <span>
            Requests{" "}
            <span className="ml-1 text-foreground">{thread.pendingRequests.length}</span>
          </span>
          <span>
            Updated{" "}
            <span className="ml-1 text-foreground">{formatRelativeTime(thread.updatedAt)}</span>
          </span>
        </div>
      </div>

      {lastError ? (
        <div className="px-4 pt-3 md:px-5">
          <Alert className="border-destructive/20 bg-destructive/5">
            <AlertTitle>Latest client error</AlertTitle>
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <ScrollArea className="h-[48svh] px-4 py-3 md:h-[calc(100svh-25rem)] md:px-5 lg:h-[calc(100svh-21rem)]">
        <div className="min-w-0 max-w-full space-y-4 pb-4">
          {pendingEntries.length > 0 ? (
            <section className="space-y-3">
              <div className="space-y-1">
                <p className="font-mono text-[0.68rem] tracking-[0.28em] text-secondary uppercase">
                  Attention required
                </p>
                <h3 className="font-heading text-xl tracking-[-0.04em]">Pending requests</h3>
              </div>
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
            </section>
          ) : null}

          {thread.turns.length === 0 ? (
            <EmptyDetailState
              isDesktop={isDesktop}
              message="Send the first message to materialize this thread and start tracking turns."
              title="No turns yet"
            />
          ) : (
            <section className="min-w-0 max-w-full space-y-3">
              <div className="space-y-1">
                <p className="font-mono text-[0.68rem] tracking-[0.28em] text-primary/85 uppercase">
                  Timeline
                </p>
                <h3 className="font-heading text-xl tracking-[-0.04em]">Turn activity</h3>
              </div>

              <Accordion
                className="min-w-0 max-w-full space-y-2.5"
                collapsible
                key={thread.id}
                type="single"
                {...accordionDefaultValue}
              >
                {orderedTurns.map((turn) => (
                  <AccordionItem
                    className="min-w-0 max-w-full overflow-hidden rounded-[14px] border border-white/8 bg-card/78 px-3 shadow-[0_12px_28px_rgba(0,0,0,0.16)]"
                    key={turn.id}
                    value={turn.id}
                  >
                    <AccordionTrigger className="min-w-0 max-w-full py-3 hover:no-underline">
                      <div className="flex min-w-0 max-w-full flex-1 flex-col gap-2 pr-4 text-left">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="min-w-0 truncate font-heading text-base tracking-[-0.04em] md:text-lg">
                            {turn.id}
                          </span>
                          <StatusBadge label={turn.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                          <span>{formatTimestamp(turn.startedAt)}</span>
                          {turn.durationMs ? (
                            <span>{Math.round(turn.durationMs / 1000)}s</span>
                          ) : null}
                          {turn.completedAt ? (
                            <span>done {formatRelativeTime(turn.completedAt)}</span>
                          ) : null}
                          {!turn.completedAt && turn.startedAt ? (
                            <span>live</span>
                          ) : null}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="min-w-0 max-w-full space-y-3 pb-3">
                      {turn.error ? (
                        <Alert className="border-destructive/20 bg-destructive/5">
                          <AlertTitle>Turn error</AlertTitle>
                          <AlertDescription>{turn.error.message}</AlertDescription>
                        </Alert>
                      ) : null}

                      <div className="min-w-0 max-w-full space-y-3">
                        {turn.items.map((item) => (
                          <ThreadItemRenderer item={item} key={item.id} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          )}
        </div>
      </ScrollArea>

      <div className="sticky bottom-0 z-10 border-t border-white/6 bg-background/82 px-4 py-3 backdrop-blur-xl md:px-5">
        <form
          className="space-y-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (thread.id.length === 0) {
              return;
            }

            void (async () => {
              const sent = await onSendMessage(thread.id, composerText);
              if (sent) {
                setComposerText("");
              }
            })();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <Label className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-muted-foreground" htmlFor="thread-composer">
              Send a message
            </Label>
            {activeTurnId ? (
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-primary">
                Live thread
              </p>
            ) : null}
          </div>
          <Textarea
            className="border-0 bg-accent/82 font-mono text-sm leading-6 placeholder:text-muted-foreground/45"
            id="thread-composer"
            onChange={(event) => {
              setComposerText(event.target.value);
            }}
            placeholder="Steer the current thread, request a change, or answer with more context."
            rows={4}
            value={composerText}
          />
          <div className="rounded-[12px] border border-white/8 bg-card/55 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                Composer ready
              </p>
              <p className="font-mono text-[0.68rem] text-muted-foreground">
                {composerText.trim().length} chars
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="w-full sm:flex-1"
                disabled={sendMessagePending || composerText.trim().length === 0}
                type="submit"
              >
              {sendMessagePending ? "Sending..." : "Send message"}
              </Button>
              {activeTurnId ? (
                <Button
                  className="w-full sm:w-auto"
                  disabled={interruptPending}
                  onClick={() => {
                    void onInterrupt(thread.id, activeTurnId);
                  }}
                  type="button"
                  variant="outline"
                >
                  {interruptPending ? "Interrupting..." : "Interrupt turn"}
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </Card>
  );
}

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

function ThreadItemRenderer({ item }: { item: ThreadItem }) {
  switch (item.type) {
    case "userMessage":
      return (
        <TimelineItem
          icon={<UserRound className="size-4 text-primary" />}
          tone="user"
          title="User message"
        >
          <div className="space-y-3">
            {item.content.map((input, index) => (
              <UserInputRenderer input={input} key={`${item.id}-${index}`} />
            ))}
          </div>
        </TimelineItem>
      );
    case "agentMessage":
      return (
        <TimelineItem
          icon={<Bot className="size-4 text-primary" />}
          title="Assistant"
          tone="assistant"
        >
          {item.text ? (
            <RichMarkdown content={item.text} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">No text returned.</p>
          )}
        </TimelineItem>
      );
    case "reasoning":
      return (
        <TimelineItem
          icon={<Brain className="size-4 text-primary" />}
          title="Reasoning"
          tone="reasoning"
        >
          <div className="space-y-2.5">
            {item.summary.length > 0 ? (
              <ul className="space-y-2 text-sm leading-6 text-foreground">
                {item.summary.map((summary, index) => (
                  <li
                    className="rounded-xl border border-white/8 bg-background/35 px-3 py-2"
                    key={`${item.id}-summary-${index}`}
                  >
                    {summary}
                  </li>
                ))}
              </ul>
            ) : null}
            {item.content.length > 0 ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button size="xs" variant="outline">
                    Show detailed reasoning
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="space-y-3 rounded-xl bg-background/70 p-4">
                    {item.content.map((content, index) => (
                      <div
                        className="rounded-xl border border-white/8 bg-background/45 px-4 py-3"
                        key={`${item.id}-content-${index}`}
                      >
                        {looksLikeMarkdownContent(content) ? (
                          <RichMarkdown className="text-sm text-muted-foreground" content={content} />
                        ) : (
                          <ReasoningPreformatted content={content} />
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </TimelineItem>
      );
    case "commandExecution":
      return (
        <TimelineItem
          icon={<SquareTerminal className="size-4 text-primary" />}
          title="Command"
          tone="command"
        >
          <div className="space-y-2.5">
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.08))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/6 bg-[linear-gradient(90deg,rgba(78,222,163,0.08),rgba(255,255,255,0.02))] px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-primary/85">
                    Shell execution
                  </span>
                  <span className="text-xs text-muted-foreground">Selected workspace</span>
                </div>
                <StatusBadge label={item.status} />
              </div>
              <div className="space-y-3 bg-[linear-gradient(180deg,rgba(8,10,12,0.82),rgba(14,16,18,0.95))] p-4">
                <RichCodeBlock
                  chrome={false}
                  className="rounded-xl border border-white/6 bg-black/18"
                  language="bash"
                  shellPrompt
                >
                  {item.command}
                </RichCodeBlock>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/6 bg-white/3 px-3 py-2">
                  <span className="font-mono text-[0.64rem] uppercase tracking-[0.16em] text-muted-foreground">
                    cwd
                  </span>
                  <p className="min-w-0 break-words font-mono text-xs leading-6 text-foreground/88">
                    {item.cwd}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/6 bg-background/35 px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{item.status}</span>
              {item.exitCode !== undefined ? <span> / exit {item.exitCode}</span> : null}
              {item.durationMs ? (
                <span> / {Math.round(item.durationMs / 1000)}s</span>
              ) : null}
            </div>
            {item.aggregatedOutput ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button size="xs" variant="outline">
                    Show output
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <RichTerminalOutput className="bg-black/60" content={item.aggregatedOutput} />
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </TimelineItem>
      );
    case "fileChange":
      return (
        <TimelineItem
          icon={<FileCode2 className="size-4 text-primary" />}
          title="File change"
          tone="file"
        >
          <div className="space-y-2.5">
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              {item.status} / {item.changes.length} file{item.changes.length === 1 ? "" : "s"}
            </div>
            <div className="space-y-2">
              {item.changes.map((change, index) => (
                <div
                  className="overflow-hidden rounded-xl bg-background/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                  key={`${item.id}-${index}`}
                >
                  <div className="flex items-center justify-between gap-3 bg-background/85 px-3 py-2">
                    <p className="min-w-0 truncate font-mono text-xs text-foreground">
                      {change.path}
                    </p>
                    {change.kind ? (
                      <span className="font-mono text-[0.64rem] uppercase tracking-[0.12em] text-muted-foreground">
                        {change.kind}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-3">
                    {change.diff ? (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button size="xs" variant="outline">
                            Show diff
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <RichCodeBlock className="bg-black/45" language="diff">
                            {change.diff}
                          </RichCodeBlock>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TimelineItem>
      );
    case "webSearch":
      return (
        <TimelineItem
          icon={<Search className="size-4 text-primary" />}
          title="Web search"
          tone="auxiliary"
        >
          <p className="text-sm text-foreground">{item.query}</p>
        </TimelineItem>
      );
    case "imageView":
      return (
        <TimelineItem
          icon={<GalleryHorizontal className="size-4 text-primary" />}
          title="Image view"
          tone="auxiliary"
        >
          <p className="text-sm text-foreground">{item.path}</p>
        </TimelineItem>
      );
    case "unknown":
      return (
        <TimelineItem
          icon={<ExternalLink className="size-4 text-primary" />}
          title={item.title}
          tone="auxiliary"
        >
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button size="xs" variant="outline">
                Show raw payload
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <RichCodeBlock className="bg-black/35" language="json">
                {JSON.stringify(item.raw, null, 2)}
              </RichCodeBlock>
            </CollapsibleContent>
          </Collapsible>
        </TimelineItem>
      );
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

function StructuredUserInput({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-background/45 px-3 py-2.5">
      <p className="font-mono text-[0.64rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function TimelineItem({
  children,
  icon,
  title,
  tone
}: {
  children: import("react").ReactNode;
  icon: import("react").ReactNode;
  title: string;
  tone: "assistant" | "auxiliary" | "command" | "file" | "reasoning" | "user";
}) {
  const toneClasses =
    tone === "user"
      ? "border-primary/12 bg-primary/7"
      : tone === "assistant"
        ? "border-white/8 bg-card/78"
        : tone === "reasoning"
          ? "border-secondary/12 bg-secondary/6"
          : tone === "command"
            ? "border-white/8 bg-background/70"
            : tone === "file"
              ? "border-white/8 bg-background/66"
              : "border-white/8 bg-accent/60";

  return (
    <div className={cn("min-w-0 max-w-full rounded-[12px] border p-3", toneClasses)}>
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-primary/12">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{title}</p>
        </div>
      </div>
      {children}
    </div>
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
    <Badge className={cn("border-0 font-mono text-[0.68rem] uppercase", classes)} variant="secondary">
      {label}
    </Badge>
  );
}
