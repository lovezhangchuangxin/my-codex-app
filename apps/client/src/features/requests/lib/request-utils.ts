import type {
  JsonRpcRequestId,
  PendingRequest,
  RequestPermissionProfile,
  ThreadSummary,
} from '@my-codex-app/protocol';
import { translateEnglish } from '@/lib/i18n/catalog';

export interface PendingRequestEntry {
  request: PendingRequest;
  thread: Pick<ThreadSummary, 'id' | 'cwd' | 'name' | 'preview' | 'status'>;
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
