import { startTransition, useDeferredValue, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
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
import type { ThreadListState } from "@my-codex-app/sdk";
import type { LocalConnectionState } from "@my-codex-app/protocol";
import { formatPendingRequestKind } from "@/features/requests/lib/request-utils";
import { useI18n } from "@/lib/i18n/use-i18n";

import {
  buildThreadTitle,
  formatRelativeTime,
  formatStatusLabel,
  formatTimestamp,
  getStatusTone,
  getWorkspaceLabel,
  groupThreadsByWorkspace,
  matchesThreadFilter,
  summarizePendingKinds,
  type ThreadStatusFilter
} from "@/features/threads/lib/thread-utils";
import { cn } from "@/lib/utils";

export function ThreadListPanel({
  connectionState,
  onOpenThread,
  selectedThreadId,
  threadsState
}: {
  connectionState: LocalConnectionState;
  onOpenThread: (threadId: string) => void;
  selectedThreadId: string | null;
  threadsState: ThreadListState;
}) {
  const { locale, t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ThreadStatusFilter>("all");
  const deferredSearch = useDeferredValue(search);
  const statusFilters: Array<{ label: string; value: ThreadStatusFilter }> = [
    { label: t("thread.filter.all"), value: "all" },
    { label: t("thread.filter.active"), value: "active" },
    { label: t("thread.filter.waitingApproval"), value: "waitingApproval" },
    { label: t("thread.filter.waitingInput"), value: "waitingInput" },
    { label: t("thread.filter.idle"), value: "idle" }
  ];

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

  const groupedThreads = groupThreadsByWorkspace(visibleThreads, t);

  return (
    <Card className="min-h-[68svh] overflow-hidden bg-card/65 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
      <CardHeader className="gap-4 border-b border-subtle/6 bg-background/35">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-[0.7rem] tracking-[0.18em] text-primary/85 uppercase">
            {t("thread.list.eyebrow")}
          </p>
          <CardTitle className="text-xl tracking-[-0.04em]">{t("thread.list.title")}</CardTitle>
          <CardDescription>
            {t("thread.list.description")}
          </CardDescription>
        </div>

        <div className="min-w-0 space-y-3">
          {threadsState.kind === "ready" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-subtle/6 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="secondary">
                {t("thread.list.badge.visibleCount", { count: visibleThreads.length })}
              </Badge>
              <Badge className="border border-subtle/6 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="secondary">
                {t("thread.list.badge.filterCount", { count: filterCount })}
              </Badge>
              <Badge className="border border-subtle/6 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="secondary">
                {t("thread.list.badge.loadedCount", { count: totalThreads })}
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
              placeholder={t("thread.list.searchPlaceholder")}
              value={search}
            />
          </div>

          <Tabs
            className="min-w-0"
            onValueChange={(value) => {
              setStatusFilter(value as ThreadStatusFilter);
            }}
            value={statusFilter}
          >
            <div className="max-w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList
                className="h-auto min-w-max max-w-none flex-nowrap justify-start gap-1 rounded-xl bg-background/35 p-1"
                variant="line"
              >
                {statusFilters.map((filter) => (
                  <TabsTrigger
                    className="flex-none rounded-lg border-0 px-2.5 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground transition-all duration-150 data-active:bg-accent data-active:text-primary sm:px-3"
                    key={filter.value}
                    value={filter.value}
                  >
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        <ScrollArea className="h-[56svh] px-4 lg:h-[calc(100svh-22rem)]">
          <div className="space-y-5 pb-2">
            {threadsState.kind === "loading" ? (
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

            {threadsState.kind === "error" ? (
              <Card className="bg-destructive/8">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium text-destructive">{t("thread.list.error.loadTitle")}</p>
                  <p className="text-sm text-muted-foreground">{threadsState.message}</p>
                </CardContent>
              </Card>
            ) : null}

            {threadsState.kind === "idle" ? (
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

            {threadsState.kind === "ready" && groupedThreads.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <Search className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {t("thread.list.empty.noMatches.title")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("thread.list.empty.noMatches.message")}
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
                        <h3 className="truncate font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                          {group.workspace}
                        </h3>
                        <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground uppercase">
                          {t("thread.list.workspaceCount", { count: group.items.length })}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {group.items.map((thread) => (
                        <Card
                          className={cn(
                            "border border-subtle/8 bg-card/78 shadow-[0_12px_28px_rgba(0,0,0,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:border-subtle/12 hover:bg-card/92 hover:shadow-[0_18px_38px_rgba(0,0,0,0.22)]",
                            selectedThreadId === thread.id &&
                              "border-primary/22 bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.14),0_20px_42px_rgba(0,0,0,0.22)]"
                          )}
                          key={thread.id}
                        >
                          <CardContent className="space-y-3 pt-3.5">
                            <div className="flex items-start justify-between gap-2.5">
                              <button
                                className="min-w-0 flex-1 text-left"
                                onClick={() => {
                                  onOpenThread(thread.id);
                                }}
                                type="button"
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="truncate font-heading text-base tracking-[-0.04em] md:text-[1.05rem]">
                                    {buildThreadTitle(thread, t)}
                                  </p>
                                  <StatusBadge
                                    label={formatStatusLabel(thread.status, t)}
                                    tone={getStatusTone(thread.status)}
                                  />
                                </div>
                                <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
                                  {thread.preview || t("thread.list.previewEmpty")}
                                </p>
                              </button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon-sm" variant="ghost">
                                    <MoreHorizontal className="size-4" />
                                    <span className="sr-only">{t("thread.list.action.threadActions")}</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      onOpenThread(thread.id);
                                    }}
                                  >
                                    {t("thread.list.action.openThread")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      startTransition(() => {
                                        void copyThreadId(thread.id, t);
                                      });
                                    }}
                                  >
                                    {t("thread.list.action.copyThreadId")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge className="border border-subtle/8 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
                                {thread.modelProvider}
                              </Badge>
                              <Badge className="border border-subtle/8 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
                                {getWorkspaceLabel(thread.cwd, t)}
                              </Badge>
                              {thread.pendingRequests.length > 0 ? (
                                <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
                                  {t("thread.list.badge.pending", {
                                    count: thread.pendingRequests.length
                                  })}
                                </Badge>
                              ) : null}
                            </div>

                            {thread.pendingRequests.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {summarizePendingKinds(thread.pendingRequests).map((kind) => (
                                  <Badge
                                    className="border border-subtle/8 bg-background/50 font-mono text-[0.7rem] uppercase text-muted-foreground"
                                    key={kind}
                                    variant="secondary"
                                  >
                                    {formatPendingRequestKind(kind, t)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}

                            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-subtle/8 bg-background/45 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
                              <span>
                                {t("thread.list.updated", {
                                  relative: formatRelativeTime(thread.updatedAt, locale, t)
                                })}
                              </span>
                              <span className="truncate text-right">
                                {formatTimestamp(thread.updatedAt, locale, t)}
                              </span>
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

async function copyThreadId(threadId: string, t: (key: string) => string) {
  try {
    await navigator.clipboard.writeText(threadId);
    toast.success(t("thread.list.toast.copySuccess"));
  } catch {
    toast.error(t("thread.list.toast.copyError"));
  }
}

function StatusBadge({
  label,
  tone
}: {
  label: string;
  tone: ReturnType<typeof getStatusTone>;
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

function idleThreadListTitle(
  connectionState: LocalConnectionState,
  t: (key: string) => string
): string {
  switch (connectionState.kind) {
    case "unpaired":
      return t("thread.idle.unpaired.title");
    case "revoked":
      return t("thread.idle.revoked.title");
    case "expired":
      return t("thread.idle.expired.title");
    case "refreshing":
      return t("thread.idle.refreshing.title");
    case "reconnecting":
      return t("thread.idle.reconnecting.title");
    case "resyncing":
      return t("thread.idle.resyncing.title");
    case "disconnected":
      return t("thread.idle.disconnected.title");
    default:
      return t("thread.idle.generic.title");
  }
}

function idleThreadListMessage(
  connectionState: LocalConnectionState,
  t: (key: string) => string
): string {
  switch (connectionState.kind) {
    case "unpaired":
      return t("thread.idle.unpaired.message");
    case "revoked":
      return connectionState.message ?? t("thread.idle.revoked.message");
    case "expired":
      return connectionState.message ?? t("thread.idle.expired.message");
    case "refreshing":
      return t("thread.idle.refreshing.message");
    case "reconnecting":
      return connectionState.message ?? t("thread.idle.reconnecting.message");
    case "resyncing":
      return t("thread.idle.resyncing.message");
    case "disconnected":
      return connectionState.message ?? t("thread.idle.disconnected.message");
    default:
      return t("thread.idle.generic.message");
  }
}
