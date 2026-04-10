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
      <Card className="min-h-[68svh] border border-border/70 bg-card/85 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
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
      <Card className="min-h-[68svh] border border-destructive/20 bg-destructive/5 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
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
    <Card className="min-h-[68svh] border border-border/70 bg-card/88 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
      <div className="border-b border-border/70 px-4 py-4 md:px-6">
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
                <h2 className="truncate font-heading text-2xl tracking-tight md:text-3xl">
                  {buildThreadTitle(thread)}
                </h2>
                <StatusBadge label={formatStatusLabel(thread.status)} />
              </div>
              <p className="truncate text-sm text-muted-foreground">{thread.cwd}</p>
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
            <Badge variant="outline">{thread.modelProvider}</Badge>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">{getWorkspaceLabel(thread.cwd)}</Badge>
          <Badge variant="outline">Updated {formatRelativeTime(thread.updatedAt)}</Badge>
          {thread.pendingRequests.length > 0 ? (
            <Badge className="bg-primary/10 text-primary" variant="secondary">
              {thread.pendingRequests.length} pending
            </Badge>
          ) : null}
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
                <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                  Attention required
                </p>
                <h3 className="font-heading text-xl tracking-tight">Pending requests</h3>
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
                <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                  Timeline
                </p>
                <h3 className="font-heading text-xl tracking-tight">Turn activity</h3>
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
                    className="overflow-hidden rounded-[24px] border border-border/70 bg-background/75 px-4 shadow-sm"
                    key={turn.id}
                    value={turn.id}
                  >
                    <AccordionTrigger className="py-4 hover:no-underline">
                      <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-heading text-lg tracking-tight">
                            {turn.id}
                          </span>
                          <StatusBadge label={turn.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
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

      <div className="border-t border-border/70 bg-background/55 px-4 py-4 backdrop-blur md:px-6">
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
          <Label htmlFor="thread-composer">Send a message</Label>
          <Textarea
            id="thread-composer"
            onChange={(event) => {
              setComposerText(event.target.value);
            }}
            placeholder="Steer the current thread, request a change, or answer with more context."
            rows={4}
            value={composerText}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={sendMessagePending || composerText.trim().length === 0} type="submit">
              {sendMessagePending ? "Sending..." : "Send message"}
            </Button>
            {activeTurnId ? (
              <Button
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
      <SheetContent className="max-w-sm border-l border-border/70 bg-card/95" side="right">
        <SheetHeader>
          <SheetTitle>Switch thread</SheetTitle>
          <SheetDescription>
            Jump straight into another workspace without losing your current route.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {threadsState.threads.map((thread) => (
            <Button
              className={cn(
                "h-auto w-full justify-start rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-left",
                selectedThreadId === thread.id && "border-primary/30 bg-primary/10"
              )}
              key={thread.id}
              onClick={() => {
                onOpenThread(thread.id);
              }}
              variant="ghost"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {buildThreadTitle(thread)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
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
    <Card className="min-h-[68svh] border border-border/70 bg-card/88 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
      <CardContent className={cn("grid min-h-[68svh] place-items-center p-6", !isDesktop && "min-h-[60svh]")}>
        <div className="max-w-md space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-6" />
          </div>
          <h2 className="font-heading text-2xl tracking-tight">{title}</h2>
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
        <TimelineItem icon={<Bot className="size-4 text-primary" />} title="Assistant">
          <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {item.text || "No text returned."}
          </div>
        </TimelineItem>
      );
    case "reasoning":
      return (
        <TimelineItem icon={<Brain className="size-4 text-primary" />} title="Reasoning">
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
                  <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4 font-mono text-xs leading-6 text-muted-foreground">
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
        <TimelineItem icon={<SquareTerminal className="size-4 text-primary" />} title="Command">
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4 font-mono text-xs leading-6 text-foreground">
              <p>{item.command}</p>
              <p className="text-muted-foreground">{item.cwd}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{item.status}</Badge>
              {item.exitCode !== undefined ? <Badge variant="outline">Exit {item.exitCode}</Badge> : null}
              {item.durationMs ? (
                <Badge variant="outline">{Math.round(item.durationMs / 1000)}s</Badge>
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
                  <pre className="overflow-x-auto rounded-2xl border border-border/70 bg-background/70 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-muted-foreground">
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
        <TimelineItem icon={<FileCode2 className="size-4 text-primary" />} title="File change">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{item.status}</Badge>
              <Badge variant="outline">{item.changes.length} file(s)</Badge>
            </div>
            <div className="space-y-2">
              {item.changes.map((change, index) => (
                <div className="rounded-2xl border border-border/70 bg-background/70 p-3" key={`${item.id}-${index}`}>
                  <p className="font-mono text-xs text-foreground">{change.path}</p>
                  {change.kind ? (
                    <p className="mt-1 text-xs text-muted-foreground">{change.kind}</p>
                  ) : null}
                  {change.diff ? (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button className="mt-3" size="sm" variant="outline">
                          Show diff
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3">
                        <pre className="overflow-x-auto rounded-2xl border border-border/70 bg-muted/50 p-3 font-mono text-xs leading-6 whitespace-pre-wrap text-muted-foreground">
                          {change.diff}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </TimelineItem>
      );
    case "webSearch":
      return (
        <TimelineItem icon={<Search className="size-4 text-primary" />} title="Web search">
          <p className="text-sm text-foreground">{item.query}</p>
        </TimelineItem>
      );
    case "imageView":
      return (
        <TimelineItem icon={<GalleryHorizontal className="size-4 text-primary" />} title="Image view">
          <p className="text-sm text-foreground">{item.path}</p>
        </TimelineItem>
      );
    case "unknown":
      return (
        <TimelineItem icon={<ExternalLink className="size-4 text-primary" />} title={item.title}>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="outline">
                Show raw payload
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <pre className="overflow-x-auto rounded-2xl border border-border/70 bg-background/70 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-muted-foreground">
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
  title
}: {
  children: import("react").ReactNode;
  icon: import("react").ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-card/75 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10">
          {icon}
        </span>
        <p className="font-medium text-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  const classes =
    label === "Waiting approval"
      ? "bg-amber-500/12 text-amber-700"
      : label === "Waiting input"
        ? "bg-sky-500/12 text-sky-700"
        : label === "Active" || label === "completed"
          ? "bg-emerald-500/12 text-emerald-700"
          : label === "inProgress"
            ? "bg-primary/12 text-primary"
            : label === "failed" || label === "System error"
              ? "bg-destructive/12 text-destructive"
              : "bg-muted text-muted-foreground";

  return (
    <Badge className={classes} variant="secondary">
      {label}
    </Badge>
  );
}
