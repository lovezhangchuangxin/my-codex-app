import { PendingRequestList } from "@/features/requests/components/pending-request-list";
import type { PendingRequestEntry } from "@/features/requests/lib/request-utils";
import { useRequestDrafts } from "@/features/requests/lib/use-request-drafts";
import type { RequestRespondRequest } from "@my-codex-app/protocol";

export function InlineRequestCard({
  entries,
  highlightedRequestKey,
  onOpenThread,
  onRespondToRequest,
  respondingRequestIds
}: {
  entries: PendingRequestEntry[];
  highlightedRequestKey: string | null | undefined;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  respondingRequestIds: Array<string | number>;
}) {
  const drafts = useRequestDrafts();

  if (entries.length === 0) return null;

  return (
    <PendingRequestList
      entries={entries}
      getDraft={drafts.getDraft}
      highlightedRequestKey={highlightedRequestKey}
      onOpenThread={onOpenThread}
      onRespondToRequest={async (request) => {
        const resolved = await onRespondToRequest(request);
        if (resolved) {
          drafts.clearRequest(request.requestId);
        }
        return resolved;
      }}
      respondingRequestIds={respondingRequestIds}
      setDraft={drafts.setDraft}
      showThreadContext={false}
    />
  );
}
