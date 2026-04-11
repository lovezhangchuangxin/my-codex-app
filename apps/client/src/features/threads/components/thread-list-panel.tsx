import { startTransition, useDeferredValue, useState } from "react";
import { MoreHorizontal, PenSquare, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type { ThreadListState } from "@my-codex-app/sdk";

import {
  buildThreadTitle,
  formatRelativeTime,
  formatStatusLabel,
  formatTimestamp,
  getWorkspaceLabel,
  groupThreadsByWorkspace,
  matchesThreadFilter,
  summarizePendingKinds,
  type ThreadStatusFilter
} from "@/features/threads/lib/thread-utils";
import { cn } from "@/lib/utils";

const statusFilters: Array<{ label: string; value: ThreadStatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Waiting approval", value: "waitingApproval" },
  { label: "Waiting input", value: "waitingInput" },
  { label: "Idle", value: "idle" }
];

export function ThreadListPanel({
  onCreateThread,
  onOpenThread,
  selectedThreadId,
  startThreadPending,
  threadsState
}: {
  onCreateThread: () => Promise<void>;
  onOpenThread: (threadId: string) => void;
  selectedThreadId: string | null;
  startThreadPending: boolean;
  threadsState: ThreadListState;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>("all");
  const deferredSearch = useDeferredValue(search);

  const visibleThreads =
    threadsState.kind === "ready"
      ? threadsState.threads.filter((thread) =>
          matchesThreadFilter(thread, deferredSearch, statusFilter)
        )
      : [];
  const totalThreads = threadsState.kind === "ready" ? threadsState.threads.length : 0;
  const filterCount =
    threadsState.kind === "ready"
      ? threadsState.threads.filter((thread) =>
          matchesThreadFilter(thread, deferredSearch, statusFilter)
        ).length
      : 0;

  const groupedThreads = groupThreadsByWorkspace(visibleThreads);

  return (
    <Card className="min-h-[68svh] overflow-hidden bg-card/65 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
      <CardHeader className="gap-4 border-b border-white/6 bg-background/35">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-[0.68rem] tracking-[0.26em] text-primary/85 uppercase">
              Active sessions
            </p>
            <CardTitle className="text-xl tracking-[-0.04em]">Recent threads</CardTitle>
            <CardDescription>
              Browse active Codex work by workspace, status, and last activity.
            </CardDescription>
          </div>
          <Button
            disabled={startThreadPending}
            onClick={() => {
              void onCreateThread();
            }}
            size="sm"
          >
            <PenSquare className="size-4" />
            {startThreadPending ? "Creating..." : "New thread"}
          </Button>
        </div>

        <div className="space-y-3">
          {threadsState.kind === "ready" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
                {visibleThreads.length} visible
              </Badge>
              <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
                {filterCount} in filter
              </Badge>
              <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
                {totalThreads} loaded
              </Badge>
            </div>
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="border-0 bg-accent pl-9 font-mono text-sm tracking-[0.02em] placeholder:text-muted-foreground/55"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Query threads or metadata"
              value={search}
            />
          </div>

          <Tabs
            onValueChange={(value) => {
              setStatusFilter(value as ThreadStatusFilter);
            }}
            value={statusFilter}
          >
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-background/35 p-1" variant="line">
              {statusFilters.map((filter) => (
                <TabsTrigger
                  className="rounded-lg border-0 px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground data-active:bg-accent data-active:text-primary"
                  key={filter.value}
                  value={filter.value}
                >
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        <ScrollArea className="h-[56svh] px-4 lg:h-[calc(100svh-22rem)]">
          <div className="space-y-5 pb-2">
            {threadsState.kind === "loading" ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="rounded-[24px] bg-accent/70 p-4" key={index}>
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

            {threadsState.kind === "error" ? (
              <Card className="bg-destructive/8">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium text-destructive">Unable to load thread list</p>
                  <p className="text-sm text-muted-foreground">{threadsState.message}</p>
                </CardContent>
              </Card>
            ) : null}

            {threadsState.kind === "ready" && groupedThreads.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <Search className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">No matching threads</p>
                  <p className="text-sm text-muted-foreground">
                    Adjust the search or status filter, or start a fresh thread from this
                    panel.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {threadsState.kind === "ready"
              ? groupedThreads.map((group) => (
                  <section className="space-y-3" key={group.workspace}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-3">
                          <span className="font-mono text-xs text-primary/70">~/</span>
                          <div className="h-px flex-1 bg-linear-to-r from-white/10 to-transparent" />
                        </div>
                        <h3 className="truncate font-mono text-[0.78rem] tracking-[0.18em] text-muted-foreground uppercase">
                          {group.workspace}
                        </h3>
                        <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground uppercase">
                          {group.items.length} thread{group.items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {group.items.map((thread) => (
                        <Card
                          className={cn(
                            "border-0 bg-accent/72 transition hover:-translate-y-0.5 hover:bg-accent hover:shadow-[0_18px_40px_rgba(0,0,0,0.16)]",
                            selectedThreadId === thread.id &&
                              "bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.24),0_22px_44px_rgba(0,0,0,0.22)]"
                          )}
                          key={thread.id}
                        >
                          <CardContent className="space-y-4 pt-4">
                            <div className="flex items-start justify-between gap-3">
                              <button
                                className="min-w-0 flex-1 text-left"
                                onClick={() => {
                                  onOpenThread(thread.id);
                                }}
                                type="button"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-heading text-lg tracking-[-0.04em]">
                                    {buildThreadTitle(thread)}
                                  </p>
                                  <StatusBadge label={formatStatusLabel(thread.status)} />
                                </div>
                                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                                  {thread.preview || "No preview yet."}
                                </p>
                              </button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon-sm" variant="ghost">
                                    <MoreHorizontal className="size-4" />
                                    <span className="sr-only">Thread actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      onOpenThread(thread.id);
                                    }}
                                  >
                                    Open thread
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      startTransition(() => {
                                        void copyThreadId(thread.id);
                                      });
                                    }}
                                  >
                                    Copy thread id
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
                                {getWorkspaceLabel(thread.cwd)}
                              </Badge>
                              <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="outline">
                                {thread.modelProvider}
                              </Badge>
                              {thread.pendingRequests.length > 0 ? (
                                <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
                                  {thread.pendingRequests.length} pending
                                </Badge>
                              ) : null}
                            </div>

                            {thread.pendingRequests.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {summarizePendingKinds(thread.pendingRequests).map((kind) => (
                                  <Badge
                                    className="bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground"
                                    key={kind}
                                    variant="secondary"
                                  >
                                    {kind}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}

                            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                              <div>
                                <p className="font-mono uppercase">Updated</p>
                                <p className="mt-1 text-sm text-foreground">
                                  {formatRelativeTime(thread.updatedAt)}
                                </p>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="min-w-0">
                                    <p className="font-mono uppercase">cwd</p>
                                    <p className="mt-1 truncate font-mono text-sm text-foreground">
                                      {thread.cwd}
                                    </p>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  {thread.cwd}
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            <div className="rounded-2xl bg-background/55 px-3 py-2 font-mono text-xs text-muted-foreground">
                              Last sync: {formatTimestamp(thread.updatedAt)}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                ))
              : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

async function copyThreadId(threadId: string) {
  try {
    await navigator.clipboard.writeText(threadId);
    toast.success("Thread id copied");
  } catch {
    toast.error("Unable to copy the thread id");
  }
}

function StatusBadge({ label }: { label: string }) {
  const classes =
    label === "Waiting approval"
      ? "bg-secondary/16 text-secondary pulse-secondary"
      : label === "Waiting input"
        ? "bg-primary/12 text-primary"
        : label === "Active"
          ? "bg-primary/12 text-primary"
          : label === "System error"
            ? "bg-destructive/12 text-destructive"
            : "bg-background/70 text-muted-foreground";

  return (
    <Badge className={cn("border-0 font-mono text-[0.68rem] uppercase", classes)} variant="secondary">
      {label}
    </Badge>
  );
}
