import type { RequestRespondRequest } from '@my-codex-app/protocol';
import { PendingRequestCard } from '@/features/requests/components/pending-request-card';
import type { PendingRequestEntry } from '@/features/requests/lib/request-utils';
import { toRequestKey } from '@/features/requests/lib/request-utils';

export function PendingRequestList({
  entries,
  getDraft,
  highlightedRequestKey,
  onOpenThread,
  onRespondToRequest,
  respondingRequestIds,
  setDraft,
  showThreadContext,
}: {
  entries: PendingRequestEntry[];
  getDraft: (requestId: string | number, questionId: string) => string;
  highlightedRequestKey: string | null | undefined;
  onOpenThread: ((threadId: string, requestKey?: string) => void) | undefined;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  respondingRequestIds: Array<string | number>;
  setDraft: (
    requestId: string | number,
    questionId: string,
    value: string,
  ) => void;
  showThreadContext: boolean;
}) {
  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <PendingRequestCard
          entry={entry}
          getDraft={getDraft}
          highlighted={
            highlightedRequestKey === toRequestKey(entry.request.requestId)
          }
          key={`${entry.thread.id}-${toRequestKey(entry.request.requestId)}`}
          onOpenThread={onOpenThread}
          onRespondToRequest={onRespondToRequest}
          responding={respondingRequestIds.some(
            (requestId) =>
              toRequestKey(requestId) === toRequestKey(entry.request.requestId),
          )}
          setDraft={setDraft}
          showThreadContext={showThreadContext}
        />
      ))}
    </div>
  );
}
