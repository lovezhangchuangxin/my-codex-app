import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { buildThreadTitle } from "@/features/threads/lib/thread-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { ThreadListState } from "@my-codex-app/sdk";

export function ThreadSwitcherSheet({
  isDesktop,
  onOpenChange,
  onOpenThread,
  open,
  selectedThreadId,
  threadsState
}: {
  isDesktop: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenThread: (threadId: string) => void;
  open: boolean;
  selectedThreadId: string | null;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="max-w-sm border-l border-subtle/6 bg-card/95"
        onOpenAutoFocus={(event) => {
          const content = event.currentTarget as HTMLElement | null;
          const target = content?.querySelector<HTMLButtonElement>(
            '[data-thread-switcher-item="selected"], [data-thread-switcher-item="first"]'
          );
          if (!target) {
            return;
          }
          event.preventDefault();
          target?.focus();
        }}
        side="right"
      >
        <SheetHeader>
          <SheetTitle>{t("detail.switcher.title")}</SheetTitle>
          <SheetDescription>{t("detail.switcher.description")}</SheetDescription>
        </SheetHeader>
        <div
          className={cn(
            "overflow-y-auto px-4 pb-4",
            isDesktop ? "max-h-[calc(100vh-7rem)]" : "max-h-[calc(100svh-7rem)]"
          )}
        >
          {threadsState.kind === "loading" ? (
            <p className="text-sm text-muted-foreground">{t("detail.switcher.loading")}</p>
          ) : null}

          {threadsState.kind === "error" ? (
            <p className="text-sm text-muted-foreground">{threadsState.message}</p>
          ) : null}

          {threadsState.kind === "idle" ? (
            <p className="text-sm text-muted-foreground">{t("detail.switcher.unavailable")}</p>
          ) : null}

          {threadsState.kind === "ready" ? (
            threadsState.threads.length > 0 ? (
              <div className="space-y-2">
                {threadsState.threads.map((threadItem) => (
                  <Button
                    className={cn(
                      "h-auto w-full justify-start rounded-[12px] border border-subtle/8 bg-card/76 px-4 py-3 text-left",
                      selectedThreadId === threadItem.id
                        ? "border-primary/20 bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.14)]"
                        : ""
                    )}
                    data-thread-switcher-item={
                      selectedThreadId === threadItem.id
                        ? "selected"
                        : threadItem.id === threadsState.threads[0]?.id
                          ? "first"
                          : undefined
                    }
                    key={threadItem.id}
                    onClick={() => {
                      onOpenThread(threadItem.id);
                      onOpenChange(false);
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
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.switcher.empty")}</p>
            )
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
