export interface JsonRpcRequest<TParams> {
  id: number;
  method: string;
  params: TParams;
}

export interface JsonRpcSuccess<TResult> {
  id: number;
  result: TResult;
}

export interface JsonRpcFailure {
  id: number;
  error: {
    code: number;
    message: string;
  };
}

export interface InitializeResult {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

export interface InitializeParams {
  clientInfo: {
    name: string;
    title: string;
    version: string;
  };
}

export interface AppServerThreadStatus {
  type: 'notLoaded' | 'idle' | 'systemError' | 'active';
  activeFlags?: Array<'waitingOnApproval' | 'waitingOnUserInput'>;
}

export interface AppServerThread {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  path?: string | null;
  cwd: string;
  modelProvider: string;
  status: AppServerThreadStatus;
  name?: string;
  turns?: AppServerTurn[];
}

export type AppServerReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export type AppServerApprovalPolicy =
  | 'untrusted'
  | 'on-failure'
  | 'on-request'
  | 'never'
  | {
      granular: {
        sandbox_approval: boolean;
        rules: boolean;
        skill_approval: boolean;
        request_permissions: boolean;
        mcp_elicitations: boolean;
      };
    };

export type AppServerSandboxPolicy =
  | { type: 'dangerFullAccess' }
  | { type: 'readOnly'; access: unknown; networkAccess: boolean }
  | { type: 'externalSandbox'; networkAccess: 'restricted' | 'enabled' }
  | {
      type: 'workspaceWrite';
      writableRoots: string[];
      readOnlyAccess: unknown;
      networkAccess: boolean;
      excludeTmpdirEnvVar: boolean;
      excludeSlashTmp: boolean;
    };

export interface ThreadListParams {
  limit?: number;
  cursor?: string | null;
  cwd?: string | null;
}

export interface ThreadListResult {
  data: AppServerThread[];
  nextCursor?: string | null;
}

export interface AppServerTurnError {
  message: string;
  additionalDetails?: string;
}

export interface AppServerUserInput {
  type: 'text' | 'image' | 'localImage' | 'skill' | 'mention';
  text?: string;
  textElements?: unknown[];
  url?: string;
  path?: string;
  name?: string;
}

export interface AppServerThreadItem {
  type: string;
  id: string;
  [key: string]: unknown;
}

export interface AppServerTurn {
  id: string;
  status: 'completed' | 'interrupted' | 'failed' | 'inProgress';
  error?: AppServerTurnError;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  items: AppServerThreadItem[];
}

export interface ThreadReadParams {
  threadId: string;
  includeTurns: boolean;
}

export interface ThreadReadResult {
  thread: AppServerThread & {
    turns?: AppServerTurn[];
  };
}

export interface ThreadStartParams {
  cwd?: string;
}

export interface ThreadStartResult {
  thread: AppServerThread & {
    turns: AppServerTurn[];
  };
  model: string;
  modelProvider: string;
  approvalPolicy: AppServerApprovalPolicy;
  sandbox: AppServerSandboxPolicy;
  reasoningEffort: AppServerReasoningEffort | null;
}

export interface ThreadSetNameParams {
  threadId: string;
  name: string;
}

export interface ThreadSetNameResult {}

export interface ThreadResumeParams {
  threadId: string;
}

export interface ThreadResumeResult {
  thread: AppServerThread & {
    turns: AppServerTurn[];
  };
  model: string;
  modelProvider: string;
  approvalPolicy: AppServerApprovalPolicy;
  sandbox: AppServerSandboxPolicy;
  reasoningEffort: AppServerReasoningEffort | null;
}

export interface ThreadUnsubscribeParams {
  threadId: string;
}

export interface ThreadCompactStartParams {
  threadId: string;
}

export interface ThreadCompactStartResult {}

export type AppServerReviewDelivery = 'inline' | 'detached';

export type AppServerReviewTarget =
  | { type: 'uncommittedChanges' }
  | { type: 'baseBranch'; branch: string }
  | { type: 'commit'; sha: string; title?: string }
  | { type: 'custom'; instructions: string };

export interface ReviewStartParams {
  threadId: string;
  target: AppServerReviewTarget;
  delivery?: AppServerReviewDelivery;
}

export interface ReviewStartResult {
  turn: AppServerTurn;
  reviewThreadId: string;
}

export interface TurnStartParams {
  threadId: string;
  input: AppServerUserInput[];
  model?: string | null;
  effort?: AppServerReasoningEffort | null;
  approvalPolicy?: AppServerApprovalPolicy | null;
  sandboxPolicy?: AppServerSandboxPolicy | null;
}

export interface TurnStartResult {
  turn: AppServerTurn;
}

export interface ModelListParams {
  includeHidden?: boolean;
}

export interface AppServerModelReasoningEffortOption {
  reasoningEffort: AppServerReasoningEffort;
  description: string;
}

export interface AppServerModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  defaultReasoningEffort: AppServerReasoningEffort;
  supportedReasoningEfforts: AppServerModelReasoningEffortOption[];
  supportsPersonality: boolean;
  isDefault: boolean;
}

export interface ModelListResult {
  data: AppServerModel[];
  nextCursor?: string | null;
}

export interface AppServerTokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface AppServerThreadTokenUsage {
  total: AppServerTokenUsageBreakdown;
  last: AppServerTokenUsageBreakdown;
  modelContextWindow: number | null;
}

export interface TurnInterruptParams {
  threadId: string;
  turnId: string;
}

export interface FsReadFileParams {
  path: string;
}

export interface FsReadFileResult {
  dataBase64: string;
}

export interface FsReadDirectoryParams {
  path: string;
}

export interface FsReadDirectoryResult {
  entries: Array<{
    fileName: string;
    isDirectory: boolean;
    isFile: boolean;
  }>;
}

export interface NotificationEnvelope {
  method: string;
  params?: unknown;
}

export interface RequestEnvelope {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface AppServerAdditionalFileSystemPermissions {
  read?: string[] | null;
  write?: string[] | null;
}

export interface AppServerAdditionalNetworkPermissions {
  enabled?: boolean | null;
}

export interface AppServerAdditionalPermissionProfile {
  network?: AppServerAdditionalNetworkPermissions | null;
  fileSystem?: AppServerAdditionalFileSystemPermissions | null;
}

export interface AppServerNetworkApprovalContext {
  host: string;
  protocol: 'http' | 'https' | 'socks5Tcp' | 'socks5Udp';
}

export interface AppServerExecPolicyAmendment {
  command: string[];
}

export type AppServerNetworkPolicyRuleAction = 'allow' | 'deny';

export interface AppServerNetworkPolicyAmendment {
  host: string;
  action: AppServerNetworkPolicyRuleAction;
}

export type AppServerCommandAction =
  | {
      type: 'read';
      command: string;
      name: string;
      path: string;
    }
  | {
      type: 'listFiles';
      command: string;
      path?: string | null;
    }
  | {
      type: 'search';
      command: string;
      query?: string | null;
      path?: string | null;
    }
  | {
      type: 'unknown';
      command: string;
    };

export type AppServerCommandApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: AppServerExecPolicyAmendment;
      };
    }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: AppServerNetworkPolicyAmendment;
      };
    }
  | 'decline'
  | 'cancel';

export interface AppServerCommandExecutionRequestApprovalParams {
  threadId: string;
  turnId: string;
  itemId: string;
  approvalId?: string | null;
  reason?: string | null;
  networkApprovalContext?: AppServerNetworkApprovalContext | null;
  command?: string | null;
  cwd?: string | null;
  commandActions?: AppServerCommandAction[] | null;
  additionalPermissions?: AppServerAdditionalPermissionProfile | null;
  proposedExecpolicyAmendment?: AppServerExecPolicyAmendment | null;
  proposedNetworkPolicyAmendments?: AppServerNetworkPolicyAmendment[] | null;
  availableDecisions?: AppServerCommandApprovalDecision[] | null;
}

export interface AppServerReasoningSummaryPartAddedNotification {
  threadId: string;
  turnId: string;
  itemId: string;
  summaryIndex: number;
}

export interface AppServerReasoningSummaryTextDeltaNotification {
  threadId: string;
  turnId: string;
  itemId: string;
  summaryIndex: number;
  delta: string;
}

export interface AppServerReasoningTextDeltaNotification {
  threadId: string;
  turnId: string;
  itemId: string;
  contentIndex: number;
  delta: string;
}
