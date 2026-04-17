import type {
  AvailableModel,
  CommandAction,
  CommandApprovalDecision,
  CommandApprovalDecisionApplyNetworkPolicyAmendment,
  CommandApprovalDecisionAcceptWithExecpolicyAmendment,
  ExecPolicyAmendment,
  GrantedPermissionProfile,
  JsonRpcRequestId,
  NetworkApprovalContext,
  NetworkPolicyAmendment,
  PendingRequest,
  PendingUserInputQuestion,
  ReasoningEffort,
  RequestPermissionProfile,
  ThreadContextUsage,
  ThreadDetail,
  ThreadItem,
  ThreadRuntimeStatus,
  ThreadSettings,
  ThreadSummary,
  TurnDetail,
  UserInput,
} from '@my-codex-app/protocol';

import type {
  AppServerCommandAction,
  AppServerModel,
  AppServerReasoningEffort,
  AppServerThread,
  AppServerThreadItem,
  AppServerThreadTokenUsage,
  AppServerTurn,
  AppServerUserInput,
  ThreadResumeResult,
  ThreadStartResult,
} from '../appServerClient.js';
import { derivePermissionPreset } from './permissionPresets.js';
import type { ThreadRuntimeCache } from './threadRuntimeCache.js';

type JsonRpcParams = Record<string, unknown>;

export function toThreadSummary(
  thread: AppServerThread,
  pendingRequests: PendingRequest[],
): ThreadSummary {
  return {
    id: thread.id,
    preview: thread.preview,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    cwd: thread.cwd,
    modelProvider: thread.modelProvider,
    status: toRuntimeStatus(thread.status),
    pendingRequests,
    ...(thread.name !== undefined ? { name: thread.name } : {}),
  };
}

export function toThreadDetail(
  thread: AppServerThread,
  pendingRequests: PendingRequest[],
): ThreadDetail {
  return {
    ...toThreadSummary(thread, pendingRequests),
    turns: (thread.turns ?? []).map((turn) => toTurnDetail(turn)),
    settings: null,
    contextUsage: null,
  };
}

export function attachThreadRuntime(
  cache: ThreadRuntimeCache,
  thread: ThreadDetail,
): ThreadDetail {
  const merged = cache.mergeCachedCommandItems(thread.id, thread);
  return {
    ...merged,
    settings: cache.getThreadSettings(thread.id),
    contextUsage: cache.getContextUsage(thread.id),
  };
}

export function toTurnDetail(turn: AppServerTurn): TurnDetail {
  return {
    id: turn.id,
    status: turn.status,
    ...(turn.startedAt !== undefined ? { startedAt: turn.startedAt } : {}),
    ...(turn.completedAt !== undefined
      ? { completedAt: turn.completedAt }
      : {}),
    ...(turn.durationMs !== undefined ? { durationMs: turn.durationMs } : {}),
    ...(turn.error
      ? {
          error: {
            message: turn.error.message,
            ...(turn.error.additionalDetails !== undefined
              ? { additionalDetails: turn.error.additionalDetails }
              : {}),
          },
        }
      : {}),
    items: turn.items.map((item) => toThreadItem(item)),
  };
}

export function toThreadSettings(
  result: ThreadStartResult | ThreadResumeResult,
): ThreadSettings {
  return {
    model: result.model,
    reasoningEffort: toReasoningEffort(result.reasoningEffort),
    permissionsPreset: derivePermissionPreset(
      result.approvalPolicy,
      result.sandbox,
    ),
  };
}

export function mergeThreadSettings(
  current: ThreadSettings | null,
  overrides:
    | {
        model?: string | null;
        reasoningEffort?: ReasoningEffort | null;
        permissionsPreset?: ThreadSettings['permissionsPreset'];
      }
    | undefined,
): ThreadSettings | null {
  if (!current && !overrides) {
    return null;
  }

  return {
    model:
      overrides?.model !== undefined
        ? overrides.model
        : (current?.model ?? null),
    reasoningEffort:
      overrides?.reasoningEffort !== undefined
        ? overrides.reasoningEffort
        : (current?.reasoningEffort ?? null),
    permissionsPreset:
      overrides?.permissionsPreset !== undefined
        ? overrides.permissionsPreset
        : (current?.permissionsPreset ?? null),
  };
}

export function toReasoningEffort(
  value: AppServerReasoningEffort | null,
): ReasoningEffort | null {
  return value;
}

export function toAppServerReasoningEffort(
  value: ReasoningEffort | null,
): AppServerReasoningEffort | null {
  return value;
}

export function toAvailableModel(model: AppServerModel): AvailableModel {
  return {
    id: model.id,
    model: model.model,
    displayName: model.displayName,
    description: model.description,
    hidden: model.hidden,
    defaultReasoningEffort: model.defaultReasoningEffort,
    supportedReasoningEfforts: model.supportedReasoningEfforts.map(
      (option) => ({
        reasoningEffort: option.reasoningEffort,
        description: option.description,
      }),
    ),
    supportsPersonality: model.supportsPersonality,
    isDefault: model.isDefault,
  };
}

export function toThreadContextUsage(
  tokenUsage: AppServerThreadTokenUsage,
): ThreadContextUsage {
  return {
    total: {
      totalTokens: tokenUsage.total.totalTokens,
      inputTokens: tokenUsage.total.inputTokens,
      cachedInputTokens: tokenUsage.total.cachedInputTokens,
      outputTokens: tokenUsage.total.outputTokens,
      reasoningOutputTokens: tokenUsage.total.reasoningOutputTokens,
    },
    last: {
      totalTokens: tokenUsage.last.totalTokens,
      inputTokens: tokenUsage.last.inputTokens,
      cachedInputTokens: tokenUsage.last.cachedInputTokens,
      outputTokens: tokenUsage.last.outputTokens,
      reasoningOutputTokens: tokenUsage.last.reasoningOutputTokens,
    },
    modelContextWindow: tokenUsage.modelContextWindow,
  };
}

export function toThreadItem(item: AppServerThreadItem): ThreadItem {
  switch (item.type) {
    case 'userMessage':
      return {
        type: 'userMessage',
        id: item.id,
        content: Array.isArray(item.content)
          ? item.content.map((input) =>
              toUserInput(input as Record<string, unknown>),
            )
          : [],
      };
    case 'agentMessage':
      return {
        type: 'agentMessage',
        id: item.id,
        text: typeof item.text === 'string' ? item.text : '',
      };
    case 'reasoning':
      return {
        type: 'reasoning',
        id: item.id,
        summary: Array.isArray(item.summary)
          ? item.summary.filter(isString)
          : [],
        content: Array.isArray(item.content)
          ? item.content.filter(isString)
          : [],
      };
    case 'commandExecution':
      return {
        type: 'commandExecution',
        id: item.id,
        command: typeof item.command === 'string' ? item.command : '',
        cwd: typeof item.cwd === 'string' ? item.cwd : '',
        status: typeof item.status === 'string' ? item.status : 'unknown',
        ...(typeof item.aggregatedOutput === 'string'
          ? { aggregatedOutput: item.aggregatedOutput }
          : {}),
        ...(typeof item.exitCode === 'number'
          ? { exitCode: item.exitCode }
          : {}),
        ...(typeof item.durationMs === 'number'
          ? { durationMs: item.durationMs }
          : {}),
      };
    case 'fileChange':
      return {
        type: 'fileChange',
        id: item.id,
        status: typeof item.status === 'string' ? item.status : 'unknown',
        changes: Array.isArray(item.changes)
          ? item.changes.map((change) => {
              const next =
                typeof change === 'object' && change !== null
                  ? (change as Record<string, unknown>)
                  : {};
              return {
                path: typeof next.path === 'string' ? next.path : 'unknown',
                ...(typeof next.kind === 'string' ? { kind: next.kind } : {}),
                ...(typeof next.diff === 'string' ? { diff: next.diff } : {}),
              };
            })
          : [],
      };
    case 'webSearch':
      return {
        type: 'webSearch',
        id: item.id,
        query: typeof item.query === 'string' ? item.query : '',
      };
    case 'imageView':
      return {
        type: 'imageView',
        id: item.id,
        path: typeof item.path === 'string' ? item.path : '',
      };
    case 'enteredReviewMode':
      return {
        type: 'enteredReviewMode',
        id: item.id,
        review: typeof item.review === 'string' ? item.review : '',
      };
    case 'exitedReviewMode':
      return {
        type: 'exitedReviewMode',
        id: item.id,
        review: typeof item.review === 'string' ? item.review : '',
      };
    case 'contextCompaction':
      return {
        type: 'contextCompaction',
        id: item.id,
      };
    default:
      return {
        type: 'unknown',
        id: item.id,
        title: item.type,
        raw: item,
      };
  }
}

export function toUserInput(input: Record<string, unknown>): UserInput {
  switch (input.type) {
    case 'text':
      return {
        type: 'text',
        text: typeof input.text === 'string' ? input.text : '',
      };
    case 'image':
      return {
        type: 'image',
        url: typeof input.url === 'string' ? input.url : '',
      };
    case 'localImage':
      return {
        type: 'localImage',
        path: typeof input.path === 'string' ? input.path : '',
      };
    case 'skill':
      return {
        type: 'skill',
        name: typeof input.name === 'string' ? input.name : '',
        path: typeof input.path === 'string' ? input.path : '',
      };
    case 'mention':
      return {
        type: 'mention',
        name: typeof input.name === 'string' ? input.name : '',
        path: typeof input.path === 'string' ? input.path : '',
      };
    default:
      return { type: 'text', text: '' };
  }
}

export function toAppServerUserInput(input: UserInput): AppServerUserInput {
  switch (input.type) {
    case 'text':
      return { type: 'text', text: input.text, textElements: [] };
    case 'image':
      return { type: 'image', url: input.url };
    case 'localImage':
      return { type: 'localImage', path: input.path };
    case 'skill':
      return { type: 'skill', name: input.name, path: input.path };
    case 'mention':
      return { type: 'mention', name: input.name, path: input.path };
  }
}

export function toRuntimeStatus(
  status: AppServerThread['status'],
): ThreadRuntimeStatus {
  switch (status.type) {
    case 'notLoaded':
      return { type: 'notLoaded' };
    case 'idle':
      return { type: 'idle' };
    case 'systemError':
      return { type: 'systemError' };
    case 'active':
      return {
        type: 'active',
        activeFlags: status.activeFlags ?? [],
      };
  }
}

export function toRequestPermissionProfile(
  value: unknown,
): RequestPermissionProfile {
  const payload = toObject(value);
  if (!payload) {
    return {};
  }

  const network = toObject(payload.network);
  const fileSystem = toObject(payload.fileSystem);

  return {
    ...(network && typeof network.enabled === 'boolean'
      ? { network: { enabled: network.enabled } }
      : {}),
    ...(fileSystem
      ? {
          fileSystem: {
            ...(Array.isArray(fileSystem.read)
              ? { read: fileSystem.read.filter(isString) }
              : {}),
            ...(Array.isArray(fileSystem.write)
              ? { write: fileSystem.write.filter(isString) }
              : {}),
          },
        }
      : {}),
  };
}

export function toGrantedPermissionProfile(
  value: GrantedPermissionProfile,
): Record<string, unknown> {
  return {
    ...(value.network
      ? { network: { enabled: value.network.enabled ?? null } }
      : {}),
    ...(value.fileSystem
      ? {
          fileSystem: {
            read: value.fileSystem.read ?? null,
            write: value.fileSystem.write ?? null,
          },
        }
      : {}),
  };
}

export function toPendingUserInputQuestion(
  value: unknown,
): PendingUserInputQuestion | null {
  const payload = toObject(value);
  const id = payload ? asString(payload.id) : null;
  const header = payload ? asString(payload.header) : null;
  const question = payload ? asString(payload.question) : null;
  if (!payload || !id || !header || !question) {
    return null;
  }

  return {
    id,
    header,
    question,
    isOther: payload.isOther === true,
    isSecret: payload.isSecret === true,
    ...(Array.isArray(payload.options)
      ? {
          options: payload.options.flatMap((option) => {
            const nextOption = toPendingUserInputQuestionOption(option);
            return nextOption ? [nextOption] : [];
          }),
        }
      : {}),
  };
}

export function toCommandActionList(value: unknown): CommandAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((action) => {
    const nextAction = toCommandAction(action);
    return nextAction ? [nextAction] : [];
  });
}

export function toCommandApprovalDecision(
  value: unknown,
): CommandApprovalDecision | null {
  if (value === 'accept' || value === 'acceptForSession') {
    return value;
  }

  if (value === 'decline' || value === 'cancel') {
    return value;
  }

  const payload = toObject(value);
  if (!payload) {
    return null;
  }

  const acceptPayload = toObject(payload.acceptWithExecpolicyAmendment);
  if (acceptPayload) {
    const amendment = toExecPolicyAmendment(acceptPayload.execpolicy_amendment);
    if (!amendment) {
      return null;
    }

    const decision: CommandApprovalDecisionAcceptWithExecpolicyAmendment = {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: amendment,
      },
    };
    return decision;
  }

  const applyPayload = toObject(payload.applyNetworkPolicyAmendment);
  if (applyPayload) {
    const amendment = toNetworkPolicyAmendment(
      applyPayload.network_policy_amendment,
    );
    if (!amendment) {
      return null;
    }

    const decision: CommandApprovalDecisionApplyNetworkPolicyAmendment = {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: amendment,
      },
    };
    return decision;
  }

  return null;
}

export function toCommandApprovalDecisions(
  value: unknown,
): CommandApprovalDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((decision) => {
    const nextDecision = toCommandApprovalDecision(decision);
    return nextDecision ? [nextDecision] : [];
  });
}

export function toNetworkApprovalContext(
  value: unknown,
): NetworkApprovalContext | null {
  const payload = toObject(value);
  const host = payload ? asString(payload.host) : null;
  const protocol = payload ? asString(payload.protocol) : null;
  if (
    !payload ||
    !host ||
    !protocol ||
    (protocol !== 'http' &&
      protocol !== 'https' &&
      protocol !== 'socks5Tcp' &&
      protocol !== 'socks5Udp')
  ) {
    return null;
  }

  return {
    host,
    protocol,
  };
}

export function toExecPolicyAmendment(
  value: unknown,
): ExecPolicyAmendment | null {
  const payload = toObject(value);
  if (!payload || !Array.isArray(payload.command)) {
    return null;
  }

  return {
    command: payload.command.filter(isString),
  };
}

export function toNetworkPolicyAmendment(
  value: unknown,
): NetworkPolicyAmendment | null {
  const payload = toObject(value);
  const host = payload ? asString(payload.host) : null;
  const action = payload ? asString(payload.action) : null;
  if (
    !payload ||
    !host ||
    !action ||
    (action !== 'allow' && action !== 'deny')
  ) {
    return null;
  }

  return {
    host,
    action,
  };
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asRequestId(value: unknown): JsonRpcRequestId | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

export function toObject(value: unknown): JsonRpcParams | null {
  return typeof value === 'object' && value !== null
    ? (value as JsonRpcParams)
    : null;
}

function toPendingUserInputQuestionOption(
  value: unknown,
): NonNullable<PendingUserInputQuestion['options']>[number] | null {
  const payload = toObject(value);
  const label = payload ? asString(payload.label) : null;
  const description = payload ? asString(payload.description) : null;
  if (!payload || !label || !description) {
    return null;
  }

  return {
    label,
    description,
  };
}

function toCommandAction(value: unknown): CommandAction | null {
  const payload = toObject(value) as AppServerCommandAction | null;
  if (!payload || !asString(payload.type)) {
    return null;
  }

  switch (payload.type) {
    case 'read': {
      const command = asString(payload.command);
      const name = asString(payload.name);
      const path = asString(payload.path);
      if (!command || !name || !path) {
        return null;
      }
      return { type: 'read', command, name, path };
    }
    case 'listFiles': {
      const command = asString(payload.command);
      if (!command) {
        return null;
      }
      const path = asString(payload.path);
      return {
        type: 'listFiles',
        command,
        ...(path ? { path } : {}),
      };
    }
    case 'search': {
      const command = asString(payload.command);
      if (!command) {
        return null;
      }
      const query = asString(payload.query);
      const path = asString(payload.path);
      return {
        type: 'search',
        command,
        ...(query ? { query } : {}),
        ...(path ? { path } : {}),
      };
    }
    case 'unknown': {
      const command = asString(payload.command);
      if (!command) {
        return null;
      }
      return {
        type: 'unknown',
        command,
      };
    }
    default:
      return null;
  }
}
