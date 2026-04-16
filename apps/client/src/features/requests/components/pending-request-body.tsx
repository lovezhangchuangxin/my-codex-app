import { Badge } from '@/components/ui/badge';
import {
  describeCommandAction,
  describePermissionProfile,
  getRequestDescription,
} from '@/features/requests/lib/request-utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { PendingRequest } from '@my-codex-app/protocol';

export function PendingRequestBody({ request }: { request: PendingRequest }) {
  const { t } = useI18n();

  switch (request.kind) {
    case 'command':
      return (
        <div className="space-y-3">
          {request.command ? (
            <div className="rounded-xl bg-black/45 p-4 font-mono text-xs leading-6">
              {request.command}
            </div>
          ) : null}
          {request.cwd ? (
            <p className="text-sm text-muted-foreground">
              {t('request.command.cwd')}: {request.cwd}
            </p>
          ) : null}
          {request.commandActions?.length ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {t('request.command.actions')}
              </p>
              <ul className="space-y-1">
                {request.commandActions.map((action, index) => (
                  <li key={`${request.itemId}-action-${index}`}>
                    {describeCommandAction(action, t)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {request.additionalPermissions ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {t('request.command.additionalPermissions')}
              </p>
              <ul className="space-y-1">
                {describePermissionProfile(
                  request.additionalPermissions,
                  t,
                ).map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {request.networkApprovalContext ? (
            <p className="text-sm text-muted-foreground">
              {t('request.command.networkContext', {
                protocol: request.networkApprovalContext.protocol,
                host: request.networkApprovalContext.host,
              })}
            </p>
          ) : null}
          {request.proposedExecpolicyAmendment ? (
            <p className="text-sm text-muted-foreground">
              {t('request.command.execPolicyHint', {
                command: request.proposedExecpolicyAmendment.command.join(' '),
              })}
            </p>
          ) : null}
          {request.proposedNetworkPolicyAmendments?.length ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {t('request.command.networkPolicyHints')}
              </p>
              <ul className="space-y-1">
                {request.proposedNetworkPolicyAmendments.map(
                  (amendment, index) => (
                    <li key={`${amendment.host}-${amendment.action}-${index}`}>
                      {t('request.command.networkPolicyHintItem', {
                        host: amendment.host,
                        action:
                          amendment.action === 'allow'
                            ? t('request.command.networkPolicyAction.allow')
                            : t('request.command.networkPolicyAction.deny'),
                      })}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}
        </div>
      );
    case 'fileChange':
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('request.fileChange.waiting')}</p>
          {request.grantRoot ? (
            <p className="font-mono">
              {t('request.fileChange.grantRoot', { root: request.grantRoot })}
            </p>
          ) : null}
        </div>
      );
    case 'permissions':
      return (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {describePermissionProfile(request.permissions, t).map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      );
    case 'userInput':
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t('request.userInput.waitingQuestions', {
              count: request.questions.length,
            })}
          </p>
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

export function PendingRequestTitle({ request }: { request: PendingRequest }) {
  const { t } = useI18n();
  return <>{getRequestDescription(request, t)}</>;
}
