import type {
  BridgeEvent,
  CommandApprovalDecision,
  FileChangeApprovalDecision,
  PendingRequest,
} from '@my-codex-app/protocol';

import type {
  AppServerThread,
  AppServerThreadItem,
  AppServerThreadTokenUsage,
  AppServerReasoningSummaryPartAddedNotification,
  AppServerReasoningSummaryTextDeltaNotification,
  AppServerReasoningTextDeltaNotification,
  AppServerTurn,
  AppServerCommandExecutionRequestApprovalParams,
  RequestEnvelope,
} from '../appServerClient';
import {
  asRequestId,
  asNumber,
  asString,
  attachThreadRuntime,
  toCommandActionList,
  toCommandApprovalDecisions,
  toExecPolicyAmendment,
  toNetworkApprovalContext,
  toNetworkPolicyAmendment,
  isString,
  toObject,
  toPendingUserInputQuestion,
  toRequestPermissionProfile,
  toThreadContextUsage,
  toThreadDetail,
  toThreadItem,
  toTurnDetail,
  toRuntimeStatus,
} from './threadMappers';
import type { ThreadRuntimeCache } from './threadRuntimeCache';

export class ThreadEventTranslator {
  constructor(private readonly cache: ThreadRuntimeCache) {}

  toNotificationBridgeEvent(
    method: string,
    params: unknown,
  ): BridgeEvent | null {
    const payload = toObject(params);
    if (!payload) {
      return null;
    }

    switch (method) {
      case 'thread/started': {
        const rawThread = payload.thread as AppServerThread;
        this.cache.setThreadCwd(rawThread.id, rawThread.cwd);
        const thread = attachThreadRuntime(
          this.cache,
          toThreadDetail(
            rawThread,
            this.cache.listPendingRequests(rawThread.id),
          ),
        );
        return { type: 'threadStarted', threadId: thread.id, thread };
      }
      case 'thread/status/changed': {
        const threadId = asString(payload.threadId);
        const statusPayload = payload.status as AppServerThread['status'];
        return threadId
          ? {
              type: 'threadStatusChanged',
              threadId,
              status: toRuntimeStatus(statusPayload),
            }
          : null;
      }
      case 'thread/name/updated': {
        const threadId = asString(payload.threadId);
        if (!threadId) {
          return null;
        }

        return {
          type: 'threadNameUpdated',
          threadId,
          threadName:
            payload.threadName === null ? null : asString(payload.threadName),
        };
      }
      case 'turn/started': {
        const threadId = asString(payload.threadId);
        const turn = toTurnDetail(payload.turn as AppServerTurn);
        return threadId ? { type: 'turnStarted', threadId, turn } : null;
      }
      case 'turn/completed': {
        const threadId = asString(payload.threadId);
        const turn = toTurnDetail(payload.turn as AppServerTurn);
        return threadId ? { type: 'turnCompleted', threadId, turn } : null;
      }
      case 'error': {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const errorPayload = toObject(payload.error);
        if (!threadId || !turnId || !errorPayload) {
          return null;
        }
        const message = asString(errorPayload.message) ?? 'Unknown error';
        const additionalDetails = asString(errorPayload.additionalDetails);
        return {
          type: 'turnError',
          threadId,
          turnId,
          error: {
            message,
            ...(additionalDetails ? { additionalDetails } : {}),
          },
          willRetry: !!payload.willRetry,
        };
      }
      case 'item/started': {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const item = toThreadItem(payload.item as AppServerThreadItem);
        return threadId && turnId
          ? { type: 'itemStarted', threadId, turnId, item }
          : null;
      }
      case 'item/completed': {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const item = toThreadItem(payload.item as AppServerThreadItem);
        return threadId && turnId
          ? { type: 'itemCompleted', threadId, turnId, item }
          : null;
      }
      case 'item/agentMessage/delta': {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const itemId = asString(payload.itemId);
        const delta = asString(payload.delta);
        return threadId && turnId && itemId && delta !== null
          ? { type: 'agentMessageDelta', threadId, turnId, itemId, delta }
          : null;
      }
      case 'item/reasoning/summaryPartAdded': {
        const notification =
          payload as unknown as AppServerReasoningSummaryPartAddedNotification;
        const threadId = asString(notification.threadId);
        const turnId = asString(notification.turnId);
        const itemId = asString(notification.itemId);
        const summaryIndex = asNumber(notification.summaryIndex);
        return threadId &&
          turnId &&
          itemId &&
          isValidReasoningIndex(summaryIndex)
          ? {
              type: 'reasoningSummaryPartAdded',
              threadId,
              turnId,
              itemId,
              summaryIndex,
            }
          : null;
      }
      case 'item/reasoning/summaryTextDelta': {
        const notification =
          payload as unknown as AppServerReasoningSummaryTextDeltaNotification;
        const threadId = asString(notification.threadId);
        const turnId = asString(notification.turnId);
        const itemId = asString(notification.itemId);
        const summaryIndex = asNumber(notification.summaryIndex);
        const delta = asString(notification.delta);
        return threadId &&
          turnId &&
          itemId &&
          isValidReasoningIndex(summaryIndex) &&
          delta !== null
          ? {
              type: 'reasoningSummaryTextDelta',
              threadId,
              turnId,
              itemId,
              summaryIndex,
              delta,
            }
          : null;
      }
      case 'item/reasoning/textDelta': {
        const notification =
          payload as unknown as AppServerReasoningTextDeltaNotification;
        const threadId = asString(notification.threadId);
        const turnId = asString(notification.turnId);
        const itemId = asString(notification.itemId);
        const contentIndex = asNumber(notification.contentIndex);
        const delta = asString(notification.delta);
        return threadId &&
          turnId &&
          itemId &&
          isValidReasoningIndex(contentIndex) &&
          delta !== null
          ? {
              type: 'reasoningTextDelta',
              threadId,
              turnId,
              itemId,
              contentIndex,
              delta,
            }
          : null;
      }
      case 'thread/tokenUsage/updated': {
        const threadId = asString(payload.threadId);
        const tokenUsage = toObject(
          payload.tokenUsage,
        ) as AppServerThreadTokenUsage | null;
        if (!threadId || !tokenUsage) {
          return null;
        }

        const contextUsage = toThreadContextUsage(tokenUsage);
        this.cache.setContextUsage(threadId, contextUsage);
        return {
          type: 'threadContextUsageUpdated',
          threadId,
          contextUsage,
        };
      }
      case 'serverRequest/resolved': {
        const threadId = asString(payload.threadId);
        const requestId = asRequestId(payload.requestId);
        if (!threadId || requestId === null) {
          return null;
        }

        this.cache.resolvePendingRequest(requestId);
        return { type: 'pendingRequestResolved', threadId, requestId };
      }
      case 'thread/closed': {
        const threadId = asString(payload.threadId);
        if (threadId) {
          this.cache.clearThreadPendingRequests(threadId);
          this.cache.clearContextUsage(threadId);
        }
        return null;
      }
      default:
        return null;
    }
  }

  toRequestBridgeEvent(request: RequestEnvelope): BridgeEvent | null {
    const nextRequest = this.#toPendingRequest(request);
    if (!nextRequest) {
      return null;
    }

    this.cache.upsertPendingRequest(nextRequest, request.method);
    return {
      type: 'pendingRequestAdded',
      threadId: nextRequest.threadId,
      request: nextRequest,
    };
  }

  toAppServerCommandDecision(
    requestId: number | string,
    decision: CommandApprovalDecision,
  ): unknown {
    const requestMethod = this.cache.getRequestMethod(requestId);
    if (requestMethod === 'execCommandApproval') {
      if (
        typeof decision === 'object' &&
        decision !== null &&
        'acceptWithExecpolicyAmendment' in decision
      ) {
        return {
          approved_execpolicy_amendment: {
            proposed_execpolicy_amendment:
              decision.acceptWithExecpolicyAmendment.execpolicy_amendment
                .command,
          },
        };
      }

      if (
        typeof decision === 'object' &&
        decision !== null &&
        'applyNetworkPolicyAmendment' in decision
      ) {
        return {
          network_policy_amendment: {
            network_policy_amendment:
              decision.applyNetworkPolicyAmendment.network_policy_amendment,
          },
        };
      }

      switch (decision) {
        case 'accept':
          return 'approved';
        case 'acceptForSession':
          return 'approved_for_session';
        case 'decline':
          return 'denied';
        case 'cancel':
          return 'abort';
      }
    }

    return decision;
  }

  toAppServerFileChangeDecision(
    requestId: number | string,
    decision: FileChangeApprovalDecision,
  ): string {
    const requestMethod = this.cache.getRequestMethod(requestId);
    if (requestMethod === 'applyPatchApproval') {
      switch (decision) {
        case 'accept':
          return 'approved';
        case 'acceptForSession':
          return 'approved_for_session';
        case 'decline':
          return 'denied';
        case 'cancel':
          return 'abort';
      }
    }

    return decision;
  }

  #toPendingRequest(request: RequestEnvelope): PendingRequest | null {
    const params = toObject(request.params);
    if (!params) {
      return null;
    }

    const requestedAt = nowInSeconds();
    switch (request.method) {
      case 'item/commandExecution/requestApproval': {
        const payload =
          params as unknown as AppServerCommandExecutionRequestApprovalParams;
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const itemId = asString(payload.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        const approvalId = asString(payload.approvalId);
        const reason = asString(payload.reason);
        const command = asString(payload.command);
        const cwd = asString(payload.cwd);
        const commandActions = toCommandActionList(payload.commandActions);
        const availableDecisions = toCommandApprovalDecisions(
          payload.availableDecisions,
        );
        const shouldIncludeAvailableDecisions =
          Array.isArray(payload.availableDecisions) &&
          (payload.availableDecisions.length === 0 ||
            availableDecisions.length > 0);
        const additionalPermissions = toRequestPermissionProfile(
          payload.additionalPermissions,
        );
        const networkApprovalContext = toNetworkApprovalContext(
          payload.networkApprovalContext,
        );
        const proposedExecpolicyAmendment = toExecPolicyAmendment(
          payload.proposedExecpolicyAmendment,
        );
        const proposedNetworkPolicyAmendments = Array.isArray(
          payload.proposedNetworkPolicyAmendments,
        )
          ? payload.proposedNetworkPolicyAmendments.flatMap((amendment) => {
              const nextAmendment = toNetworkPolicyAmendment(amendment);
              return nextAmendment ? [nextAmendment] : [];
            })
          : [];

        return {
          kind: 'command',
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          ...(approvalId ? { approvalId } : {}),
          ...(reason ? { reason } : {}),
          ...(command ? { command } : {}),
          ...(cwd ? { cwd } : {}),
          ...(Array.isArray(payload.commandActions) ? { commandActions } : {}),
          ...(shouldIncludeAvailableDecisions ? { availableDecisions } : {}),
          ...(hasPermissionProfile(additionalPermissions)
            ? { additionalPermissions }
            : {}),
          ...(networkApprovalContext ? { networkApprovalContext } : {}),
          ...(proposedExecpolicyAmendment
            ? { proposedExecpolicyAmendment }
            : {}),
          ...(Array.isArray(payload.proposedNetworkPolicyAmendments)
            ? { proposedNetworkPolicyAmendments }
            : {}),
        };
      }
      case 'execCommandApproval': {
        const threadId = asString(params.conversationId);
        const itemId = asString(params.callId);
        if (!threadId || !itemId) {
          return null;
        }

        const command =
          Array.isArray(params.command) && params.command.every(isString)
            ? params.command.join(' ')
            : undefined;
        const approvalId = asString(params.approvalId);
        const reason = asString(params.reason);
        const cwd = asString(params.cwd);
        return {
          kind: 'command',
          requestId: request.id,
          threadId,
          turnId: '',
          itemId,
          requestedAt,
          ...(approvalId ? { approvalId } : {}),
          ...(reason ? { reason } : {}),
          ...(command ? { command } : {}),
          ...(cwd ? { cwd } : {}),
        };
      }
      case 'item/fileChange/requestApproval': {
        const threadId = asString(params.threadId);
        const turnId = asString(params.turnId);
        const itemId = asString(params.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        const reason = asString(params.reason);
        const grantRoot = asString(params.grantRoot);
        return {
          kind: 'fileChange',
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          ...(reason ? { reason } : {}),
          ...(grantRoot ? { grantRoot } : {}),
        };
      }
      case 'applyPatchApproval': {
        const threadId = asString(params.conversationId);
        const itemId = asString(params.callId);
        if (!threadId || !itemId) {
          return null;
        }

        const reason = asString(params.reason);
        const grantRoot = asString(params.grantRoot);
        return {
          kind: 'fileChange',
          requestId: request.id,
          threadId,
          turnId: '',
          itemId,
          requestedAt,
          ...(reason ? { reason } : {}),
          ...(grantRoot ? { grantRoot } : {}),
        };
      }
      case 'item/permissions/requestApproval': {
        const threadId = asString(params.threadId);
        const turnId = asString(params.turnId);
        const itemId = asString(params.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        const reason = asString(params.reason);
        return {
          kind: 'permissions',
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          ...(reason ? { reason } : {}),
          permissions: toRequestPermissionProfile(params.permissions),
        };
      }
      case 'item/tool/requestUserInput': {
        const threadId = asString(params.threadId);
        const turnId = asString(params.turnId);
        const itemId = asString(params.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        return {
          kind: 'userInput',
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          questions: Array.isArray(params.questions)
            ? params.questions.flatMap((question) => {
                const nextQuestion = toPendingUserInputQuestion(question);
                return nextQuestion ? [nextQuestion] : [];
              })
            : [],
        };
      }
      default:
        return null;
    }
  }
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function hasPermissionProfile(value: {
  network?: { enabled?: boolean };
  fileSystem?: { read?: string[]; write?: string[] };
}): boolean {
  return value.network !== undefined || value.fileSystem !== undefined;
}

function isValidReasoningIndex(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}
