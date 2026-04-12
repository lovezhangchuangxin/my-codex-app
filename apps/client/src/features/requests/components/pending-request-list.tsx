import type {
  PendingRequest,
  PendingUserInputRequest,
  RequestRespondRequest
} from "@my-codex-app/protocol";
import {
  FolderPen,
  OctagonAlert,
  MessageSquareText,
  Shield,
  TerminalSquare
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { PendingRequestEntry } from "@/features/requests/lib/request-utils";
import {
  describePermissionProfile,
  getRequestDescription,
  getRequestKindLabel,
  toRequestKey
} from "@/features/requests/lib/request-utils";
import {
  buildThreadTitle,
  getWorkspaceLabel
} from "@/features/threads/lib/thread-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

export function PendingRequestList({
  entries,
  getDraft,
  highlightedRequestKey,
  onOpenThread,
  onRespondToRequest,
  respondingRequestIds,
  setDraft,
  showThreadContext
}: {
  entries: PendingRequestEntry[];
  getDraft: (requestId: string | number, questionId: string) => string;
  highlightedRequestKey: string | null | undefined;
  onOpenThread: ((threadId: string, requestKey?: string) => void) | undefined;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  respondingRequestIds: Array<string | number>;
  setDraft: (requestId: string | number, questionId: string, value: string) => void;
  showThreadContext: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <PendingRequestCard
          entry={entry}
          getDraft={getDraft}
          highlighted={highlightedRequestKey === toRequestKey(entry.request.requestId)}
          key={`${entry.thread.id}-${toRequestKey(entry.request.requestId)}`}
          onOpenThread={onOpenThread}
          onRespondToRequest={onRespondToRequest}
          responding={respondingRequestIds.some(
            (requestId) => toRequestKey(requestId) === toRequestKey(entry.request.requestId)
          )}
          setDraft={setDraft}
          showThreadContext={showThreadContext}
          t={t}
        />
      ))}
    </div>
  );
}

function PendingRequestCard({
  entry,
  getDraft,
  highlighted,
  onOpenThread,
  onRespondToRequest,
  responding,
  setDraft,
  showThreadContext,
  t
}: {
  entry: PendingRequestEntry;
  getDraft: (requestId: string | number, questionId: string) => string;
  highlighted: boolean;
  onOpenThread: ((threadId: string, requestKey?: string) => void) | undefined;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  responding: boolean;
  setDraft: (requestId: string | number, questionId: string, value: string) => void;
  showThreadContext: boolean;
  t: (key: string, params?: Record<string, number | string | undefined>) => string;
}) {
  const { formatDateTime } = useI18n();
  const { request, thread } = entry;

  return (
    <Card
      className={cn(
        "border-0 bg-accent/72 shadow-[0_14px_36px_rgba(0,0,0,0.18)]",
        highlighted && "bg-card shadow-[inset_0_0_0_1px_rgba(245,158,10,0.3),0_18px_44px_rgba(0,0,0,0.24)]"
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
                {getRequestIcon(request)}
                {getRequestDescription(request, t)}
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
        <RequestBody request={request} t={t} />
        <Separator className="bg-subtle/6" />
        <div className="flex items-center gap-2 rounded-xl bg-background/45 px-3 py-2">
          <OctagonAlert className="size-4 text-secondary" />
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {t("request.explicitConfirmation")}
          </p>
        </div>
        <RequestActions
          getDraft={getDraft}
          onRespondToRequest={onRespondToRequest}
          request={request}
          responding={responding}
          setDraft={setDraft}
          t={t}
        />
      </CardContent>
    </Card>
  );
}

function RequestBody({
  request,
  t
}: {
  request: PendingRequest;
  t: (key: string, params?: Record<string, number | string | undefined>) => string;
}) {
  switch (request.kind) {
    case "command":
      return (
        <div className="space-y-3">
          {request.command ? (
            <div className="rounded-xl bg-black/45 p-4 font-mono text-xs leading-6">
              {request.command}
            </div>
          ) : null}
          {request.cwd ? (
            <p className="text-sm text-muted-foreground">
              {t("request.command.cwd")}: {request.cwd}
            </p>
          ) : null}
        </div>
      );
    case "fileChange":
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("request.fileChange.waiting")}</p>
          {request.grantRoot ? (
            <p className="font-mono">{t("request.fileChange.grantRoot", { root: request.grantRoot })}</p>
          ) : null}
        </div>
      );
    case "permissions":
      return (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {describePermissionProfile(request.permissions, t).map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      );
    case "userInput":
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("request.userInput.waitingQuestions", { count: request.questions.length })}</p>
          <div className="flex flex-wrap gap-2">
            {request.questions.map((question) => (
              <Badge
                className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground"
                key={question.id}
                variant="outline"
              >
                {question.header}
              </Badge>
            ))}
          </div>
        </div>
      );
  }
}

function RequestActions({
  getDraft,
  onRespondToRequest,
  request,
  responding,
  setDraft,
  t
}: {
  getDraft: (requestId: string | number, questionId: string) => string;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  request: PendingRequest;
  responding: boolean;
  setDraft: (requestId: string | number, questionId: string, value: string) => void;
  t: (key: string, params?: Record<string, number | string | undefined>) => string;
}) {
  switch (request.kind) {
    case "command":
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: "command", decision: "accept" }
              });
            }}
            size="sm"
          >
            {t("request.action.command.allowOnce")}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: "command", decision: "acceptForSession" }
              });
            }}
            size="sm"
            variant="secondary"
          >
            {t("request.action.command.allowSession")}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: "command", decision: "decline" }
              });
            }}
            size="sm"
            variant="destructive"
          >
            {t("request.action.command.deny")}
          </Button>
        </div>
      );
    case "fileChange":
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: "fileChange", decision: "accept" }
              });
            }}
            size="sm"
          >
            {t("request.action.file.applyOnce")}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: "fileChange", decision: "acceptForSession" }
              });
            }}
            size="sm"
            variant="secondary"
          >
            {t("request.action.file.allowSession")}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: "fileChange", decision: "decline" }
              });
            }}
            size="sm"
            variant="destructive"
          >
            {t("request.action.file.deny")}
          </Button>
        </div>
      );
    case "permissions":
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: {
                  kind: "permissions",
                  permissions: request.permissions,
                  scope: "turn"
                }
              });
            }}
            size="sm"
          >
            {t("request.action.permissions.allowTurn")}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: {
                  kind: "permissions",
                  permissions: request.permissions,
                  scope: "session"
                }
              });
            }}
            size="sm"
            variant="secondary"
          >
            {t("request.action.permissions.allowSession")}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: {
                  kind: "permissions",
                  permissions: {},
                  scope: "turn"
                }
              });
            }}
            size="sm"
            variant="destructive"
          >
            {t("request.action.permissions.deny")}
          </Button>
        </div>
      );
    case "userInput":
      return (
        <UserInputActions
          getDraft={getDraft}
          onRespondToRequest={onRespondToRequest}
          request={request}
          responding={responding}
          setDraft={setDraft}
          t={t}
        />
      );
  }
}

function UserInputActions({
  getDraft,
  onRespondToRequest,
  request,
  responding,
  setDraft,
  t
}: {
  getDraft: (requestId: string | number, questionId: string) => string;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  request: PendingUserInputRequest;
  responding: boolean;
  setDraft: (requestId: string | number, questionId: string, value: string) => void;
  t: (key: string, params?: Record<string, number | string | undefined>) => string;
}) {
  const canSubmit = request.questions.every(
    (question) => getDraft(request.requestId, question.id).trim().length > 0
  );

  return (
    <div className="space-y-4">
      {request.questions.map((question) => {
        const value = getDraft(request.requestId, question.id);

        return (
          <div className="space-y-2" key={question.id}>
            <Label className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground" htmlFor={`${String(request.requestId)}-${question.id}`}>
              {question.header}
            </Label>
            <p className="text-sm text-muted-foreground">{question.question}</p>
            {question.options?.length ? (
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <Button
                    disabled={responding}
                    key={option.label}
                    onClick={() => {
                      setDraft(request.requestId, question.id, option.label);
                    }}
                    size="sm"
                    type="button"
                    variant={value === option.label ? "secondary" : "outline"}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}
            {question.isSecret ? (
              <Input
                autoComplete="off"
                className="border-0 bg-background/70 font-mono"
                disabled={responding}
                id={`${String(request.requestId)}-${question.id}`}
                onChange={(event) => {
                  setDraft(request.requestId, question.id, event.target.value);
                }}
                placeholder={t("request.action.userInput.placeholder")}
                type="password"
                value={value}
              />
            ) : (
              <Textarea
                className="border-0 bg-background/70 font-mono"
                disabled={responding}
                id={`${String(request.requestId)}-${question.id}`}
                onChange={(event) => {
                  setDraft(request.requestId, question.id, event.target.value);
                }}
                placeholder={t("request.action.userInput.placeholder")}
                rows={3}
                value={value}
              />
            )}
          </div>
        );
      })}

      <Button
        disabled={responding || !canSubmit}
        onClick={() => {
          void onRespondToRequest({
            requestId: request.requestId,
            response: {
              kind: "userInput",
              answers: Object.fromEntries(
                request.questions.map((question) => [
                  question.id,
                  {
                    answers: [getDraft(request.requestId, question.id).trim()]
                  }
                ])
              )
            }
          });
        }}
      >
        {t("request.action.userInput.submit")}
      </Button>
    </div>
  );
}

function getRequestIcon(request: PendingRequest) {
  switch (request.kind) {
    case "command":
      return <TerminalSquare className="size-4 text-secondary" />;
    case "fileChange":
      return <FolderPen className="size-4 text-secondary" />;
    case "permissions":
      return <Shield className="size-4 text-secondary" />;
    case "userInput":
      return <MessageSquareText className="size-4 text-secondary" />;
  }
}
