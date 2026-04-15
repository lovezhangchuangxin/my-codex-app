import { toast } from 'sonner';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PendingRequestList } from '@/features/requests/components/pending-request-list';
import { buildPendingRequestEntries } from '@/features/requests/lib/request-utils';
import { useRequestDrafts } from '@/features/requests/lib/use-request-drafts';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useRuntime } from '@/lib/runtime/runtime-context';
import { useRuntimeSnapshot } from '@/lib/runtime/use-runtime-snapshot';
import { appViewportHeight } from '@/platform/viewport';

export function RequestSheet({
  onOpenChange,
  onOpenThread,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  open: boolean;
}) {
  const { t } = useI18n();
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const drafts = useRequestDrafts();

  const entries =
    snapshot.threads.kind === 'ready'
      ? buildPendingRequestEntries(snapshot.threads.threads)
      : [];

  async function handleRespond(
    request: Parameters<typeof runtime.respondToRequest>[0],
  ) {
    try {
      await runtime.respondToRequest(request);
      drafts.clearRequest(request.requestId);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('requestSheet.error.respondFailed'),
      );
      return false;
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full border-t border-subtle/6 bg-card/95 sm:max-w-lg"
        side="bottom"
      >
        <SheetHeader>
          <SheetTitle>
            {t('requestSheet.title', { count: entries.length })}
          </SheetTitle>
          <SheetDescription>{t('requestSheet.description')}</SheetDescription>
        </SheetHeader>
        <ScrollArea
          className="px-4"
          style={{ height: `calc(${appViewportHeight} - 8rem)` }}
        >
          <div className="py-4">
            {entries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('requestSheet.empty')}
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
