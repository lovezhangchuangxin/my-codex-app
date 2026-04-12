import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildThreadTitle,
  formatStatusLabel,
  getStatusTone,
  getWorkspaceLabel
} from "@/features/threads/lib/thread-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { ThreadDetail } from "@my-codex-app/protocol";

export function ThreadHeader({
  isDesktop,
  onBack,
  thread
}: {
  isDesktop: boolean;
  onBack: () => void;
  thread: ThreadDetail;
}) {
  const { formatRelativeTime, t } = useI18n();

  return (
    <div className="border-b border-subtle/6 bg-background/35 px-4 py-3.5 md:px-5">
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
                <ThreadHeaderStatusBadge
                  label={formatStatusLabel(thread.status, t)}
                  tone={getStatusTone(thread.status)}
                />
              </div>
            </div>
            <p className="truncate font-mono text-xs text-muted-foreground md:text-sm">
              {thread.cwd}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 md:self-start">
          <Badge className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
            {thread.modelProvider}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
          {getWorkspaceLabel(thread.cwd, t)}
        </Badge>
        {thread.pendingRequests.length > 0 ? (
          <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
            {t("thread.list.badge.pending", { count: thread.pendingRequests.length })}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-[12px] border border-subtle/8 bg-background/38 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
        <span>
          {t("thread.meta.turns")} <span className="ml-1 text-foreground">{thread.turns.length}</span>
        </span>
        <span>
          {t("thread.meta.requests")}{" "}
          <span className="ml-1 text-foreground">{thread.pendingRequests.length}</span>
        </span>
        <span>
          {t("thread.meta.updated")}{" "}
          <span className="ml-1 text-foreground">{formatRelativeTime(thread.updatedAt)}</span>
        </span>
      </div>
    </div>
  );
}

function ThreadHeaderStatusBadge({
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
    <Badge className={`border-0 font-mono text-[0.7rem] uppercase ${classes}`} variant="secondary">
      {label}
    </Badge>
  );
}
