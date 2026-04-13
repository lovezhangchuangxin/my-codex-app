import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  FolderOpen,
  PanelLeftOpen
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { StatusBadge } from "@/features/threads/components/status-badge";
import {
  buildThreadTitle,
  formatStatusLabel,
  getStatusTone
} from "@/features/threads/lib/thread-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { ThreadListState } from "@my-codex-app/sdk";
import type { ThreadDetail } from "@my-codex-app/protocol";

export function ThreadDetailHeader({
  isDesktop,
  onBack,
  onOpenThread,
  onOpenWorkspace,
  selectedThreadId,
  thread,
  threadsState
}: {
  isDesktop: boolean;
  onBack: () => void;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onOpenWorkspace: () => void;
  selectedThreadId: string | null;
  thread: ThreadDetail;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();

  return (
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
          <Button onClick={onOpenWorkspace} size="sm" variant="outline">
            <FolderOpen className="size-3.5" />
            {t("detail.workspace.open")}
          </Button>
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
          <SheetDescription>{t("detail.switcher.description")}</SheetDescription>
        </SheetHeader>
        <div className="max-h-[calc(100svh-7rem)] space-y-2 overflow-y-auto px-4 pb-4">
          {threadsState.threads.map((threadItem) => (
            <Button
              className={cn(
                "h-auto w-full justify-start rounded-[12px] border border-subtle/8 bg-card/76 px-4 py-3 text-left",
                selectedThreadId === threadItem.id
                  ? "border-primary/20 bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.14)]"
                  : ""
              )}
              key={threadItem.id}
              onClick={() => {
                onOpenThread(threadItem.id);
              }}
              variant="ghost"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {buildThreadTitle(threadItem, t)}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {threadItem.cwd}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
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

function CopyPathButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="shrink-0 rounded-md p-1 text-popover-foreground/50 transition-colors hover:bg-subtle/10 hover:text-popover-foreground"
      onClick={(event) => {
        event.stopPropagation();
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
