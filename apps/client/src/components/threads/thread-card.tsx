import { startTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { ThreadSummary } from "@my-codex-app/protocol";

import {
  buildThreadTitle,
  formatStatusLabel,
  getStatusTone,
  getWorkspaceLabel,
  summarizePendingKinds
} from "@/features/threads/lib/thread-utils";
import { formatPendingRequestKind } from "@/features/requests/lib/request-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

export function ThreadCard({
  isSelected,
  onOpen,
  thread
}: {
  isSelected: boolean;
  onOpen: (threadId: string) => void;
  thread: ThreadSummary;
}) {
  const { formatDateTime, formatRelativeTime: formatLocalizedRelativeTime, t } = useI18n();

  return (
    <Card
      className={cn(
        "border border-subtle/8 bg-card/78 shadow-[0_12px_28px_rgba(0,0,0,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:border-subtle/12 hover:bg-card/92 hover:shadow-[0_18px_38px_rgba(0,0,0,0.22)]",
        isSelected &&
          "border-primary/22 bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.14),0_20px_42px_rgba(0,0,0,0.22)]"
      )}
    >
      <CardContent className="space-y-3 pt-3.5">
        <div className="flex items-start justify-between gap-2.5">
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              onOpen(thread.id);
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
                  onOpen(thread.id);
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
              {t("thread.list.badge.pending", { count: thread.pendingRequests.length })}
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
              relative: formatLocalizedRelativeTime(thread.updatedAt)
            })}
          </span>
          <span className="truncate text-right">{formatDateTime(thread.updatedAt)}</span>
        </div>
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
