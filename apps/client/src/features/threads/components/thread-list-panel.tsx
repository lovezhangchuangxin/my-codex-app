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

  const groupedThreads = groupThreadsByWorkspace(visibleThreads);

  return (
    <Card className="min-h-[68svh] border border-border/70 bg-card/85 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
      <CardHeader className="gap-4 border-b border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl">Recent threads</CardTitle>
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
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search by thread name, preview, cwd, or provider"
              value={search}
            />
          </div>

          <Tabs
            onValueChange={(value) => {
              setStatusFilter(value as ThreadStatusFilter);
            }}
            value={statusFilter}
          >
            <TabsList className="h-auto w-full justify-start overflow-x-auto bg-transparent p-0" variant="line">
              {statusFilters.map((filter) => (
                <TabsTrigger
                  className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 data-active:border-primary/30 data-active:bg-primary/10 data-active:text-primary"
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
                  <div
                    className="h-32 rounded-[24px] border border-border/60 bg-muted/60"
                    key={index}
                  />
                ))}
              </div>
            ) : null}

            {threadsState.kind === "error" ? (
              <Card className="border border-destructive/20 bg-destructive/5">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium text-destructive">Unable to load thread list</p>
                  <p className="text-sm text-muted-foreground">{threadsState.message}</p>
                </CardContent>
              </Card>
            ) : null}

            {threadsState.kind === "ready" && groupedThreads.length === 0 ? (
              <Card className="border border-dashed border-border/70 bg-background/70">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium">No matching threads</p>
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
                      <div>
                        <h3 className="font-heading text-lg tracking-tight">
                          {group.workspace}
                        </h3>
                        <p className="text-xs text-muted-foreground uppercase">
                          {group.items.length} thread{group.items.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {group.items.map((thread) => (
                        <Card
                          className={cn(
                            "border border-border/70 bg-background/80 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(65,46,23,0.10)]",
                            selectedThreadId === thread.id &&
                              "border-primary/35 bg-primary/8 shadow-[0_18px_44px_rgba(149,83,22,0.16)]"
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
                                  <p className="truncate font-heading text-lg tracking-tight">
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
                              <Badge variant="outline">{getWorkspaceLabel(thread.cwd)}</Badge>
                              <Badge variant="outline">{thread.modelProvider}</Badge>
                              {thread.pendingRequests.length > 0 ? (
                                <Badge className="bg-primary/10 text-primary" variant="secondary">
                                  {thread.pendingRequests.length} pending
                                </Badge>
                              ) : null}
                            </div>

                            {thread.pendingRequests.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {summarizePendingKinds(thread.pendingRequests).map((kind) => (
                                  <Badge key={kind} variant="secondary">
                                    {kind}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}

                            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                              <div>
                                <p className="uppercase">Updated</p>
                                <p className="mt-1 text-sm text-foreground">
                                  {formatRelativeTime(thread.updatedAt)}
                                </p>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="min-w-0">
                                    <p className="uppercase">cwd</p>
                                    <p className="mt-1 truncate text-sm text-foreground">
                                      {thread.cwd}
                                    </p>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                  {thread.cwd}
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            <div className="rounded-2xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
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
      ? "bg-amber-500/12 text-amber-700"
      : label === "Waiting input"
        ? "bg-sky-500/12 text-sky-700"
        : label === "Active"
          ? "bg-emerald-500/12 text-emerald-700"
          : label === "System error"
            ? "bg-destructive/12 text-destructive"
            : "bg-muted text-muted-foreground";

  return (
    <Badge className={classes} variant="secondary">
      {label}
    </Badge>
  );
}
