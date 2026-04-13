import { OctagonAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PendingRequestActions, PendingRequestIcon } from "@/features/requests/components/pending-request-actions";
import { PendingRequestBody, PendingRequestTitle } from "@/features/requests/components/pending-request-body";
import type { PendingRequestEntry } from "@/features/requests/lib/request-utils";
import {
  getRequestKindLabel,
  toRequestKey
} from "@/features/requests/lib/request-utils";
import { buildThreadTitle, getWorkspaceLabel } from "@/features/threads/lib/thread-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { RequestRespondRequest } from "@my-codex-app/protocol";

export function PendingRequestCard({
  entry,
  getDraft,
  highlighted,
  onOpenThread,
  onRespondToRequest,
  responding,
  setDraft,
  showThreadContext
}: {
  entry: PendingRequestEntry;
  getDraft: (requestId: string | number, questionId: string) => string;
  highlighted: boolean;
  onOpenThread: ((threadId: string, requestKey?: string) => void) | undefined;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  responding: boolean;
  setDraft: (requestId: string | number, questionId: string, value: string) => void;
  showThreadContext: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const { request, thread } = entry;

  return (
    <Card
      className={cn(
        "border-0 bg-accent/72 shadow-[0_14px_36px_rgba(0,0,0,0.18)]",
        highlighted &&
          "bg-card shadow-[inset_0_0_0_1px_rgba(245,158,10,0.3),0_18px_44px_rgba(0,0,0,0.24)]"
      )}
    >
      <CardHeader className="gap-3 border-b border-subtle/6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
                {getRequestKindLabel(request, t)}
              </Badge>
              <Badge className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
                {getWorkspaceLabel(thread.cwd, t)}
              </Badge>
              <Badge className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground" variant="outline">
                {formatDateTime(request.requestedAt)}
              </Badge>
            </div>
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg tracking-[-0.04em]">
                <PendingRequestIcon request={request} />
                <PendingRequestTitle request={request} />
              </CardTitle>
              {showThreadContext ? (
                <p className="text-sm text-muted-foreground">
                  {t("request.threadLabel", { title: buildThreadTitle(thread, t) })}
                </p>
              ) : null}
            </div>
          </div>
          {showThreadContext && onOpenThread ? (
            <Button
              onClick={() => {
                onOpenThread(thread.id, toRequestKey(request.requestId));
              }}
              size="sm"
              variant="outline"
            >
              {t("request.action.openThread")}
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <PendingRequestBody request={request} />
        <Separator className="bg-subtle/6" />
        <div className="flex items-center gap-2 rounded-xl bg-background/45 px-3 py-2">
          <OctagonAlert className="size-4 text-secondary" />
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {t("request.explicitConfirmation")}
          </p>
        </div>
        <PendingRequestActions
          getDraft={getDraft}
          onRespondToRequest={onRespondToRequest}
          request={request}
          responding={responding}
          setDraft={setDraft}
        />
      </CardContent>
    </Card>
  );
}
