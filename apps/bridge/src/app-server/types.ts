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
  type: "notLoaded" | "idle" | "systemError" | "active";
  activeFlags?: Array<"waitingOnApproval" | "waitingOnUserInput">;
}

export interface AppServerThread {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  modelProvider: string;
  status: AppServerThreadStatus;
  name?: string;
  turns?: AppServerTurn[];
}

export type AppServerReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type AppServerApprovalPolicy =
  | "untrusted"
  | "on-failure"
  | "on-request"
  | "never"
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
  | { type: "dangerFullAccess" }
  | { type: "readOnly"; access: unknown; networkAccess: boolean }
  | { type: "externalSandbox"; networkAccess: "restricted" | "enabled" }
  | {
      type: "workspaceWrite";
      writableRoots: string[];
      readOnlyAccess: unknown;
      networkAccess: boolean;
      excludeTmpdirEnvVar: boolean;
      excludeSlashTmp: boolean;
    };

export interface ThreadListParams {
  limit?: number;
  cursor?: string;
}

export interface ThreadListResult {
  data: AppServerThread[];
  nextCursor?: string;
}

export interface AppServerTurnError {
  message: string;
  additionalDetails?: string;
}

export interface AppServerUserInput {
  type: "text" | "image" | "localImage" | "skill" | "mention";
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
  status: "completed" | "interrupted" | "failed" | "inProgress";
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
