import { useState } from "react";
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
  formatUserInput,
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
        <CardContent className="space-y-4 pt-6">
          <div className="h-10 w-48 rounded-full bg-muted/70" />
          <div className="h-5 w-full rounded-full bg-muted/70" />
          <div className="h-5 w-5/6 rounded-full bg-muted/70" />
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="h-24 rounded-[24px] border border-border/60 bg-background/70" key={index} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (detailState.kind === "error") {
    return (
      <Card className="min-h-[68svh] bg-destructive/6 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
        <CardContent className="space-y-4 pt-6">
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
      <div className="border-b border-white/6 bg-background/35 px-4 py-4 md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {!isDesktop ? (
              <Button onClick={onBack} size="icon-sm" variant="ghost">
                <ArrowLeft className="size-4" />
                <span className="sr-only">Back to threads</span>
              </Button>
            ) : null}
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-heading text-2xl tracking-[-0.05em] md:text-3xl">
                  {buildThreadTitle(thread)}
                </h2>
                <StatusBadge label={formatStatusLabel(thread.status)} />
              </div>
              <p className="truncate font-mono text-sm text-muted-foreground">{thread.cwd}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
            {getWorkspaceLabel(thread.cwd)}
          </Badge>
          <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
            Updated {formatRelativeTime(thread.updatedAt)}
          </Badge>
          {thread.pendingRequests.length > 0 ? (
            <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
              {thread.pendingRequests.length} pending
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <HeaderMetric label="Turns" value={String(thread.turns.length)} />
          <HeaderMetric
            label="Requests"
            value={String(thread.pendingRequests.length)}
          />
          <HeaderMetric label="Last update" value={formatRelativeTime(thread.updatedAt)} />
        </div>
      </div>

      {lastError ? (
        <div className="px-4 pt-4 md:px-6">
          <Alert className="border-destructive/20 bg-destructive/5">
            <AlertTitle>Latest client error</AlertTitle>
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <ScrollArea className="h-[48svh] px-4 py-4 md:h-[calc(100svh-26rem)] md:px-6 lg:h-[calc(100svh-22rem)]">
        <div className="space-y-6 pb-6">
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
            <section className="space-y-3">
              <div className="space-y-1">
                <p className="font-mono text-[0.68rem] tracking-[0.28em] text-primary/85 uppercase">
                  Timeline
                </p>
                <h3 className="font-heading text-xl tracking-[-0.04em]">Turn activity</h3>
              </div>

              <Accordion
                className="space-y-3"
                collapsible
                key={thread.id}
                type="single"
                {...accordionDefaultValue}
              >
                {orderedTurns.map((turn) => (
                  <AccordionItem
                    className="overflow-hidden rounded-[24px] bg-accent/72 px-4 shadow-[0_14px_36px_rgba(0,0,0,0.18)]"
                    key={turn.id}
                    value={turn.id}
                  >
                    <AccordionTrigger className="py-4 hover:no-underline">
                      <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading text-lg tracking-[-0.04em]">
                            {turn.id}
                          </span>
                          <StatusBadge label={turn.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground">
                          <span>Started {formatTimestamp(turn.startedAt)}</span>
                          <span>Completed {formatTimestamp(turn.completedAt)}</span>
                          {turn.durationMs ? (
                            <span>{Math.round(turn.durationMs / 1000)}s duration</span>
                          ) : null}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      {turn.error ? (
                        <Alert className="border-destructive/20 bg-destructive/5">
                          <AlertTitle>Turn error</AlertTitle>
                          <AlertDescription>{turn.error.message}</AlertDescription>
                        </Alert>
                      ) : null}

                      <div className="space-y-3">
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

      <div className="sticky bottom-0 z-10 border-t border-white/6 bg-background/78 px-4 py-4 backdrop-blur-xl md:px-6">
        <form
          className="space-y-3"
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
            className="border-0 bg-accent font-mono text-sm leading-6 placeholder:text-muted-foreground/45"
            id="thread-composer"
            onChange={(event) => {
              setComposerText(event.target.value);
            }}
            placeholder="Steer the current thread, request a change, or answer with more context."
            rows={4}
            value={composerText}
          />
          <div className="rounded-2xl bg-card/55 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="mb-3 flex items-center justify-between gap-3">
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
        <div className="max-h-[calc(100svh-7rem)] space-y-2 overflow-y-auto px-4 pb-6">
          {threadsState.threads.map((thread) => (
            <Button
              className={cn(
                "h-auto w-full justify-start rounded-2xl border-0 bg-accent/75 px-4 py-3 text-left",
                selectedThreadId === thread.id && "bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.24)]"
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
          <div className="space-y-2 text-sm leading-6 text-foreground">
            {item.content.map((input, index) => (
              <p key={`${item.id}-${index}`}>{formatUserInput(input)}</p>
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
          <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {item.text || "No text returned."}
          </div>
        </TimelineItem>
      );
    case "reasoning":
      return (
        <TimelineItem
          icon={<Brain className="size-4 text-primary" />}
          title="Reasoning"
          tone="reasoning"
        >
          <div className="space-y-3">
            {item.summary.length > 0 ? (
              <ul className="space-y-2 text-sm leading-6 text-foreground">
                {item.summary.map((summary, index) => (
                  <li key={`${item.id}-summary-${index}`}>{summary}</li>
                ))}
              </ul>
            ) : null}
            {item.content.length > 0 ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="outline">
                    Show detailed reasoning
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="space-y-3 rounded-2xl bg-background/70 p-4 font-mono text-xs leading-6 text-muted-foreground">
                    {item.content.map((content, index) => (
                      <pre className="whitespace-pre-wrap" key={`${item.id}-content-${index}`}>
                        {content}
                      </pre>
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
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between bg-black/80 px-4 py-2">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-destructive/45" />
                  <span className="size-2.5 rounded-full bg-secondary/55" />
                  <span className="size-2.5 rounded-full bg-primary/55" />
                </div>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                  terminal
                </p>
              </div>
              <div className="space-y-2 bg-black/55 p-4 font-mono text-xs leading-6 text-foreground">
                <div className="flex gap-2">
                  <span className="text-primary">$</span>
                  <p className="min-w-0 break-words">{item.command}</p>
                </div>
                <p className="text-muted-foreground">{item.cwd}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
                {item.status}
              </Badge>
              {item.exitCode !== undefined ? (
                <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
                  Exit {item.exitCode}
                </Badge>
              ) : null}
              {item.durationMs ? (
                <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
                  {Math.round(item.durationMs / 1000)}s
                </Badge>
              ) : null}
            </div>
            {item.aggregatedOutput ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="outline">
                    Show output
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <pre className="overflow-x-auto rounded-2xl bg-black/60 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-muted-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                    {item.aggregatedOutput}
                  </pre>
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
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
                {item.status}
              </Badge>
              <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
                {item.changes.length} file(s)
              </Badge>
            </div>
            <div className="space-y-2">
              {item.changes.map((change, index) => (
                <div
                  className="overflow-hidden rounded-2xl bg-background/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                  key={`${item.id}-${index}`}
                >
                  <div className="flex items-center justify-between gap-3 bg-background/85 px-3 py-2">
                    <p className="min-w-0 truncate font-mono text-xs text-foreground">
                      {change.path}
                    </p>
                    {change.kind ? (
                      <Badge
                        className="bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground"
                        variant="secondary"
                      >
                        {change.kind}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="p-3">
                  {change.kind ? (
                    <p className="text-xs text-muted-foreground">{change.kind}</p>
                  ) : null}
                    {change.diff ? (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button className="mt-3" size="sm" variant="outline">
                            Show diff
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <pre className="overflow-x-auto rounded-2xl bg-black/45 p-3 font-mono text-xs leading-6 whitespace-pre-wrap text-muted-foreground">
                            {change.diff}
                          </pre>
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
              <Button size="sm" variant="outline">
                Show raw payload
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <pre className="overflow-x-auto rounded-2xl bg-black/35 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-muted-foreground">
                {JSON.stringify(item.raw, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </TimelineItem>
      );
  }
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
      ? "bg-primary/8 shadow-[inset_0_0_0_1px_rgba(78,222,163,0.14),0_14px_36px_rgba(0,0,0,0.18)]"
      : tone === "assistant"
        ? "bg-accent/82 shadow-[0_14px_36px_rgba(0,0,0,0.18)]"
        : tone === "reasoning"
          ? "bg-secondary/8 shadow-[inset_0_0_0_1px_rgba(245,158,10,0.12),0_14px_36px_rgba(0,0,0,0.18)]"
          : tone === "command"
            ? "bg-background/72 shadow-[inset_0_0_0_1px_rgba(78,222,163,0.08),0_14px_36px_rgba(0,0,0,0.2)]"
            : tone === "file"
              ? "bg-background/68 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),0_14px_36px_rgba(0,0,0,0.2)]"
              : "bg-accent/64 shadow-[0_14px_36px_rgba(0,0,0,0.16)]";

  return (
    <div className={cn("rounded-[22px] p-4", toneClasses)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/12">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{title}</p>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
            {tone}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background/45 px-3 py-3">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-sm text-foreground">{value}</p>
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
