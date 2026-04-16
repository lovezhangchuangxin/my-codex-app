import type {
  CommandAction,
  CommandApprovalDecision,
  CommandApprovalDecisionKind,
  JsonRpcRequestId,
  PendingCommandRequest,
  PendingRequest,
  RequestPermissionProfile,
  ThreadSummary,
} from '@my-codex-app/protocol';
import { translateEnglish } from '@/lib/i18n/catalog';

export interface PendingRequestEntry {
  request: PendingRequest;
  thread: Pick<ThreadSummary, 'id' | 'cwd' | 'name' | 'preview' | 'status'>;
}

export interface CommandDecisionOption {
  kind: CommandApprovalDecisionKind;
  decision: CommandApprovalDecision;
}

export function toRequestKey(requestId: JsonRpcRequestId) {
  return typeof requestId === 'string'
    ? `string:${requestId}`
    : `number:${requestId}`;
}

export function toQuestionAnswerKey(
  requestId: JsonRpcRequestId,
  questionId: string,
) {
  return `${toRequestKey(requestId)}:${questionId}`;
}

export function buildPendingRequestEntries(
  threads: ThreadSummary[],
): PendingRequestEntry[] {
  return threads
    .flatMap((thread) =>
      thread.pendingRequests.map((request) => ({
        request,
        thread,
      })),
    )
    .sort(
      (left, right) => right.request.requestedAt - left.request.requestedAt,
    );
}

export function formatPendingRequestKind(
  kind: PendingRequest['kind'],
  t: (key: string) => string = translateEnglish,
) {
  switch (kind) {
    case 'command':
      return t('request.kind.command');
    case 'fileChange':
      return t('request.kind.fileChange');
    case 'permissions':
      return t('request.kind.permissions');
    case 'userInput':
      return t('request.kind.userInput');
  }
}

export function getRequestKindLabel(
  request: PendingRequest,
  t: (key: string) => string = translateEnglish,
) {
  return formatPendingRequestKind(request.kind, t);
}

export function getRequestDescription(
  request: PendingRequest,
  t: (key: string) => string = translateEnglish,
) {
  switch (request.kind) {
    case 'command':
      return request.reason ?? t('request.description.commandFallback');
    case 'fileChange':
      return request.reason ?? t('request.description.fileChangeFallback');
    case 'permissions':
      return request.reason ?? t('request.description.permissionsFallback');
    case 'userInput':
      return t('request.description.userInputFallback');
  }
}

export function describePermissionProfile(
  profile: RequestPermissionProfile,
  t: (
    key: string,
    params?: Record<string, string>,
  ) => string = translateEnglish,
) {
  const details: string[] = [];

  if (profile.network?.enabled) {
    details.push(t('request.permission.networkAccess'));
  }

  if (profile.fileSystem?.read?.length) {
    details.push(
      t('request.permission.read', {
        paths: profile.fileSystem.read.join(', '),
      }),
    );
  }

  if (profile.fileSystem?.write?.length) {
    details.push(
      t('request.permission.write', {
        paths: profile.fileSystem.write.join(', '),
      }),
    );
  }

  return details.length > 0 ? details : [t('request.permission.custom')];
}

export function buildCommandDecisionOptions(
  request: PendingCommandRequest,
): CommandDecisionOption[] {
  if (request.availableDecisions !== undefined) {
    return request.availableDecisions.map((decision) => ({
      kind: toCommandDecisionKind(decision),
      decision,
    }));
  }

  const fallback = deriveFallbackCommandDecisions(request);

  const seen = new Set<string>();
  const options: CommandDecisionOption[] = [];
  for (const decision of fallback) {
    const key = getCommandDecisionKey(decision);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    options.push({
      kind: toCommandDecisionKind(decision),
      decision,
    });
  }
  return options;
}

export function toCommandDecisionKind(
  decision: CommandApprovalDecision,
): CommandApprovalDecisionKind {
  if (
    typeof decision === 'object' &&
    decision !== null &&
    'acceptWithExecpolicyAmendment' in decision
  ) {
    return 'acceptWithExecpolicyAmendment';
  }

  if (
    typeof decision === 'object' &&
    decision !== null &&
    'applyNetworkPolicyAmendment' in decision
  ) {
    return 'applyNetworkPolicyAmendment';
  }

  return decision;
}

export function describeCommandAction(
  action: CommandAction,
  t: (
    key: string,
    params?: Record<string, string>,
  ) => string = translateEnglish,
): string {
  switch (action.type) {
    case 'read':
      return t('request.commandAction.read', {
        name: action.name,
        path: action.path,
      });
    case 'listFiles':
      return t('request.commandAction.listFiles', {
        path: action.path ?? '.',
      });
    case 'search':
      return t('request.commandAction.search', {
        query: action.query ?? '',
        path: action.path ?? '.',
      });
    case 'unknown':
      return t('request.commandAction.unknown', {
        command: action.command,
      });
  }
}

function getCommandDecisionKey(decision: CommandApprovalDecision): string {
  if (
    typeof decision === 'object' &&
    decision !== null &&
    'acceptWithExecpolicyAmendment' in decision
  ) {
    return `acceptWithExecpolicyAmendment:${decision.acceptWithExecpolicyAmendment.execpolicy_amendment.command.join(
      '\u0000',
    )}`;
  }

  if (
    typeof decision === 'object' &&
    decision !== null &&
    'applyNetworkPolicyAmendment' in decision
  ) {
    const amendment =
      decision.applyNetworkPolicyAmendment.network_policy_amendment;
    return `applyNetworkPolicyAmendment:${amendment.host}:${amendment.action}`;
  }

  return decision;
}

function deriveFallbackCommandDecisions(
  request: PendingCommandRequest,
): CommandApprovalDecision[] {
  if (request.networkApprovalContext) {
    const fallback: CommandApprovalDecision[] = ['accept', 'acceptForSession'];
    const firstAllowNetworkAmendment = (
      request.proposedNetworkPolicyAmendments ?? []
    ).find((amendment) => amendment.action === 'allow');
    if (firstAllowNetworkAmendment) {
      fallback.push({
        applyNetworkPolicyAmendment: {
          network_policy_amendment: firstAllowNetworkAmendment,
        },
      });
    }
    fallback.push('cancel');
    return fallback;
  }

  if (request.additionalPermissions) {
    return ['accept', 'cancel'];
  }

  const fallback: CommandApprovalDecision[] = ['accept'];
  if (request.proposedExecpolicyAmendment) {
    fallback.push({
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: request.proposedExecpolicyAmendment,
      },
    });
  }
  fallback.push('cancel');
  return fallback;
}
