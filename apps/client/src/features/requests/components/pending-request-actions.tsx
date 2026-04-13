import {
  FolderPen,
  MessageSquareText,
  Shield,
  TerminalSquare,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n/use-i18n';
import type {
  PendingRequest,
  PendingUserInputRequest,
  RequestRespondRequest,
} from '@my-codex-app/protocol';

export function PendingRequestActions({
  getDraft,
  onRespondToRequest,
  request,
  responding,
  setDraft,
}: {
  getDraft: (requestId: string | number, questionId: string) => string;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  request: PendingRequest;
  responding: boolean;
  setDraft: (
    requestId: string | number,
    questionId: string,
    value: string,
  ) => void;
}) {
  const { t } = useI18n();

  switch (request.kind) {
    case 'command':
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: 'command', decision: 'accept' },
              });
            }}
            size="sm"
          >
            {t('request.action.command.allowOnce')}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: 'command', decision: 'acceptForSession' },
              });
            }}
            size="sm"
            variant="secondary"
          >
            {t('request.action.command.allowSession')}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: 'command', decision: 'decline' },
              });
            }}
            size="sm"
            variant="destructive"
          >
            {t('request.action.command.deny')}
          </Button>
        </div>
      );
    case 'fileChange':
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: 'fileChange', decision: 'accept' },
              });
            }}
            size="sm"
          >
            {t('request.action.file.applyOnce')}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: 'fileChange', decision: 'acceptForSession' },
              });
            }}
            size="sm"
            variant="secondary"
          >
            {t('request.action.file.allowSession')}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: { kind: 'fileChange', decision: 'decline' },
              });
            }}
            size="sm"
            variant="destructive"
          >
            {t('request.action.file.deny')}
          </Button>
        </div>
      );
    case 'permissions':
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: {
                  kind: 'permissions',
                  permissions: request.permissions,
                  scope: 'turn',
                },
              });
            }}
            size="sm"
          >
            {t('request.action.permissions.allowTurn')}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: {
                  kind: 'permissions',
                  permissions: request.permissions,
                  scope: 'session',
                },
              });
            }}
            size="sm"
            variant="secondary"
          >
            {t('request.action.permissions.allowSession')}
          </Button>
          <Button
            disabled={responding}
            onClick={() => {
              void onRespondToRequest({
                requestId: request.requestId,
                response: {
                  kind: 'permissions',
                  permissions: {},
                  scope: 'turn',
                },
              });
            }}
            size="sm"
            variant="destructive"
          >
            {t('request.action.permissions.deny')}
          </Button>
        </div>
      );
    case 'userInput':
      return (
        <PendingUserInputActions
          getDraft={getDraft}
          onRespondToRequest={onRespondToRequest}
          request={request}
          responding={responding}
          setDraft={setDraft}
        />
      );
  }
}

function PendingUserInputActions({
  getDraft,
  onRespondToRequest,
  request,
  responding,
  setDraft,
}: {
  getDraft: (requestId: string | number, questionId: string) => string;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  request: PendingUserInputRequest;
  responding: boolean;
  setDraft: (
    requestId: string | number,
    questionId: string,
    value: string,
  ) => void;
}) {
  const { t } = useI18n();
  const canSubmit = request.questions.every(
    (question) => getDraft(request.requestId, question.id).trim().length > 0,
  );

  return (
    <div className="space-y-4">
      {request.questions.map((question) => {
        const value = getDraft(request.requestId, question.id);

        return (
          <div className="space-y-2" key={question.id}>
            <Label
              className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
              htmlFor={`${String(request.requestId)}-${question.id}`}
            >
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
                    variant={value === option.label ? 'secondary' : 'outline'}
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
                placeholder={t('request.action.userInput.placeholder')}
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
                placeholder={t('request.action.userInput.placeholder')}
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
              kind: 'userInput',
              answers: Object.fromEntries(
                request.questions.map((question) => [
                  question.id,
                  {
                    answers: [getDraft(request.requestId, question.id).trim()],
                  },
                ]),
              ),
            },
          });
        }}
      >
        {t('request.action.userInput.submit')}
      </Button>
    </div>
  );
}

export function PendingRequestIcon({ request }: { request: PendingRequest }) {
  switch (request.kind) {
    case 'command':
      return <TerminalSquare className="size-4 text-secondary" />;
    case 'fileChange':
      return <FolderPen className="size-4 text-secondary" />;
    case 'permissions':
      return <Shield className="size-4 text-secondary" />;
    case 'userInput':
      return <MessageSquareText className="size-4 text-secondary" />;
  }
}
