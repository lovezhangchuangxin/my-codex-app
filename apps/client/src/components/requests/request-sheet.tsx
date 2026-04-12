import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PendingRequestList } from "@/features/requests/components/pending-request-list";
import { buildPendingRequestEntries } from "@/features/requests/lib/request-utils";
import { useRequestDrafts } from "@/features/requests/lib/use-request-drafts";
import { useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";
import { toast } from "sonner";

export function RequestSheet({
  onOpenThread,
  open,
  onOpenChange
}: {
  onOpenThread: (threadId: string, requestKey?: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const drafts = useRequestDrafts();

  const entries =
    snapshot.threads.kind === "ready"
      ? buildPendingRequestEntries(snapshot.threads.threads)
      : [];

  const totalPending = entries.length;

  async function handleRespond(request: Parameters<typeof runtime.respondToRequest>[0]): Promise<boolean> {
    try {
      await runtime.respondToRequest(request);
      drafts.clearRequest(request.requestId);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to respond");
      return false;
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-t border-white/6 bg-card/95 sm:max-w-lg" side="bottom">
        <SheetHeader>
          <SheetTitle>Pending requests ({totalPending})</SheetTitle>
          <SheetDescription>
            Approve or deny pending requests across all threads.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100svh-8rem)] px-4">
          <div className="py-4">
            {entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No pending requests
              </p>
            ) : (
              <PendingRequestList
                entries={entries}
                getDraft={drafts.getDraft}
                highlightedRequestKey={null}
                onOpenThread={(threadId, requestKey) => {
                  onOpenChange(false);
                  onOpenThread(threadId, requestKey);
                }}
                onRespondToRequest={handleRespond}
                respondingRequestIds={snapshot.mutations.respondingRequestIds}
                setDraft={drafts.setDraft}
                showThreadContext
              />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
