export type ConnectionMode = 'local' | 'relay';

export type JsonRpcRequestId = string | number;

export type BridgeAuthErrorCode =
  | 'missingCredentials'
  | 'invalidAccessToken'
  | 'expiredAccessToken'
  | 'invalidRefreshToken'
  | 'expiredRefreshToken'
  | 'revokedDevice'
  | 'invalidPairingCode'
  | 'deviceIdConflict';

export type LocalConnectionStateKind =
  | 'unpaired'
  | 'refreshing'
  | 'authenticated'
  | 'reconnecting'
  | 'resyncing'
  | 'revoked'
  | 'expired'
  | 'disconnected';

export interface LocalConnectionState {
  kind: LocalConnectionStateKind;
  message?: string;
  authErrorCode?: BridgeAuthErrorCode;
  lastSyncedAt?: number;
}

export interface DeviceInfo {
  deviceId: string;
  label: string;
  platform: string;
}

export interface DeviceTrustRecord extends DeviceInfo {
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  revokedAt?: number;
}

export interface BridgeSessionTokens {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
}

export interface PairingStatusResponse {
  pairingRequired: boolean;
  instructions: string;
  expiresAt: number;
}

export interface PairingCompleteRequest {
  code: string;
  device: DeviceInfo;
}

export interface PairingCompleteResponse {
  device: DeviceTrustRecord;
  session: BridgeSessionTokens;
}

export interface SessionRefreshRequest {
  deviceId: string;
  refreshToken: string;
}

export interface SessionRefreshResponse {
  device: DeviceTrustRecord;
  session: BridgeSessionTokens;
}

export interface DeviceListResponse {
  devices: DeviceTrustRecord[];
}

export interface DeviceRevokeRequest {
  deviceId: string;
}

export interface DeviceRevokeResponse {}

export interface DeviceDeleteRequest {
  deviceId: string;
}

export interface DeviceDeleteResponse {}

export type ThreadRuntimeStatus =
  | { type: 'notLoaded' }
  | { type: 'idle' }
  | { type: 'systemError' }
  | {
      type: 'active';
      activeFlags: Array<'waitingOnApproval' | 'waitingOnUserInput'>;
    };

export type ReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export type ThreadPermissionPresetId = 'read-only' | 'auto' | 'full-access';

export interface ThreadSettings {
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  permissionsPreset: ThreadPermissionPresetId | null;
}

export interface ModelReasoningEffortOption {
  reasoningEffort: ReasoningEffort;
  description: string;
}

export interface AvailableModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  defaultReasoningEffort: ReasoningEffort;
  supportedReasoningEfforts: ModelReasoningEffortOption[];
  supportsPersonality: boolean;
  isDefault: boolean;
}

export interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface ThreadContextUsage {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
}

export interface ThreadSummary {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  modelProvider: string;
  status: ThreadRuntimeStatus;
  pendingRequests: PendingRequest[];
  name?: string;
}

export type TurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';

export interface TurnError {
  message: string;
  additionalDetails?: string;
}

export type UserInput =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string }
  | { type: 'skill'; name: string; path: string }
  | { type: 'mention'; name: string; path: string };

export type ThreadItem =
  | { type: 'userMessage'; id: string; content: UserInput[] }
  | { type: 'agentMessage'; id: string; text: string }
  | { type: 'reasoning'; id: string; summary: string[]; content: string[] }
  | {
      type: 'commandExecution';
      id: string;
      command: string;
      cwd: string;
      status: string;
      aggregatedOutput?: string;
      exitCode?: number;
      durationMs?: number;
    }
  | {
      type: 'fileChange';
      id: string;
      status: string;
      changes: Array<{ path: string; kind?: string; diff?: string }>;
    }
  | { type: 'webSearch'; id: string; query: string }
  | { type: 'imageView'; id: string; path: string }
  | { type: 'enteredReviewMode'; id: string; review: string }
  | { type: 'exitedReviewMode'; id: string; review: string }
  | { type: 'contextCompaction'; id: string }
  | { type: 'unknown'; id: string; title: string; raw: unknown };

export interface TurnDetail {
  id: string;
  status: TurnStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: TurnError;
  items: ThreadItem[];
}

export interface ThreadDetail extends ThreadSummary {
  turns: TurnDetail[];
  settings: ThreadSettings | null;
  contextUsage: ThreadContextUsage | null;
}

export type PendingRequestKind =
  | 'command'
  | 'fileChange'
  | 'permissions'
  | 'userInput';

export type CommandApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel';

export type FileChangeApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel';

export type PermissionGrantScope = 'turn' | 'session';

export interface FileSystemPermissionProfile {
  read?: string[];
  write?: string[];
}

export interface NetworkPermissionProfile {
  enabled?: boolean;
}

export interface RequestPermissionProfile {
  network?: NetworkPermissionProfile;
  fileSystem?: FileSystemPermissionProfile;
}

export interface GrantedPermissionProfile {
  network?: NetworkPermissionProfile;
  fileSystem?: FileSystemPermissionProfile;
}

export interface PendingRequestBase {
  requestId: JsonRpcRequestId;
  threadId: string;
  turnId: string;
  itemId: string;
  requestedAt: number;
}

export interface PendingCommandRequest extends PendingRequestBase {
  kind: 'command';
  approvalId?: string;
  reason?: string;
  command?: string;
  cwd?: string;
}

export interface PendingFileChangeRequest extends PendingRequestBase {
  kind: 'fileChange';
  reason?: string;
  grantRoot?: string;
}

export interface PendingPermissionsRequest extends PendingRequestBase {
  kind: 'permissions';
  reason?: string;
  permissions: RequestPermissionProfile;
}

export interface PendingUserInputQuestionOption {
  label: string;
  description: string;
}

export interface PendingUserInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options?: PendingUserInputQuestionOption[];
}

export interface PendingUserInputRequest extends PendingRequestBase {
  kind: 'userInput';
  questions: PendingUserInputQuestion[];
}

export type PendingRequest =
  | PendingCommandRequest
  | PendingFileChangeRequest
  | PendingPermissionsRequest
  | PendingUserInputRequest;

export interface ProjectSummary {
  path: string;
  displayName: string;
  imported: boolean;
  hasDerivedThreads: boolean;
  sessionCount: number;
  pendingRequestCount: number;
  hasActiveSession: boolean;
  available: boolean;
  lastActiveAt?: number;
}

export interface ProjectListResponse {
  data: ProjectSummary[];
}

export type ProjectSearchMatchKind = 'knownProject' | 'pathSuggestion';

export interface ProjectSearchMatch {
  kind: ProjectSearchMatchKind;
  path: string;
  displayName: string;
  imported: boolean;
  hasDerivedThreads: boolean;
  available: boolean;
}

export interface ProjectSearchRequest {
  query: string;
  limit?: number;
}

export interface ProjectSearchResponse {
  query: string;
  matches: ProjectSearchMatch[];
}

export interface ProjectImportRequest {
  path: string;
}

export interface ProjectImportResponse {
  project: ProjectSummary;
}

export interface ThreadListRequest {
  limit?: number;
  cursor?: string;
  cwd?: string;
}

export interface ThreadListResponse {
  data: ThreadSummary[];
  nextCursor?: string;
}

export interface ThreadReadRequest {
  threadId: string;
}

export interface ThreadReadResponse {
  thread: ThreadDetail;
}

export interface ThreadStartRequest {
  cwd?: string;
}

export interface ThreadStartResponse {
  thread: ThreadDetail;
}

export interface ThreadRenameRequest {
  threadId: string;
  name: string;
}

export interface ThreadRenameResponse {}

export interface ThreadTurnSettingsOverrides {
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  permissionsPreset?: ThreadPermissionPresetId | null;
}

export interface TurnStartRequest {
  threadId: string;
  input: UserInput[];
  settings?: ThreadTurnSettingsOverrides;
}

export interface TurnStartResponse {
  turn: TurnDetail;
  settings?: ThreadSettings | null;
}

export interface TurnInterruptRequest {
  threadId: string;
  turnId: string;
}

export interface TurnInterruptResponse {}

export type ReviewTarget =
  | { type: 'uncommittedChanges' }
  | { type: 'baseBranch'; branch: string }
  | { type: 'commit'; sha: string; title?: string }
  | { type: 'custom'; instructions: string };

export interface ThreadCompactRequest {
  threadId: string;
}

export interface ThreadCompactResponse {}

export interface ThreadReviewRequest {
  threadId: string;
  target: ReviewTarget;
}

export interface ThreadReviewResponse {
  turn: TurnDetail;
  reviewThreadId: string;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface WorkspaceReadDirectoryRequest {
  threadId: string;
  path?: string;
}

export interface WorkspaceReadDirectoryResponse {
  root: string;
  path: string;
  entries: WorkspaceEntry[];
}

export type WorkspaceFileKind = 'text' | 'binary' | 'unsupported' | 'tooLarge';

export interface WorkspaceReadFileRequest {
  threadId: string;
  path: string;
}

export interface WorkspaceReadFileResponse {
  root: string;
  path: string;
  kind: WorkspaceFileKind;
  sizeBytes?: number;
  modifiedAtMs?: number;
  content?: string;
}

export interface WorkspaceSearchFilesRequest {
  threadId: string;
  query: string;
  limit?: number;
}

export interface WorkspaceSearchMatch {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface WorkspaceSearchFilesResponse {
  root: string;
  query: string;
  matches: WorkspaceSearchMatch[];
}

export type RequestRespondRequest =
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: 'command';
        decision: CommandApprovalDecision;
      };
    }
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: 'fileChange';
        decision: FileChangeApprovalDecision;
      };
    }
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: 'permissions';
        permissions: GrantedPermissionProfile;
        scope: PermissionGrantScope;
      };
    }
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: 'userInput';
        answers: Record<string, { answers: string[] }>;
      };
    };

export interface RequestRespondResponse {}

export interface ModelListRequest {
  includeHidden?: boolean;
}

export interface ModelListResponse {
  data: AvailableModel[];
}

export type BridgeEvent =
  | {
      type: 'threadStarted';
      threadId: string;
      thread: ThreadDetail;
    }
  | {
      type: 'threadStatusChanged';
      threadId: string;
      status: ThreadRuntimeStatus;
    }
  | {
      type: 'threadNameUpdated';
      threadId: string;
      threadName: string | null;
    }
  | {
      type: 'turnStarted';
      threadId: string;
      turn: TurnDetail;
    }
  | {
      type: 'turnCompleted';
      threadId: string;
      turn: TurnDetail;
    }
  | {
      type: 'itemStarted';
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: 'itemCompleted';
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: 'agentMessageDelta';
      threadId: string;
      turnId: string;
      itemId: string;
      delta: string;
    }
  | {
      type: 'pendingRequestAdded';
      threadId: string;
      request: PendingRequest;
    }
  | {
      type: 'pendingRequestResolved';
      threadId: string;
      requestId: JsonRpcRequestId;
    }
  | {
      type: 'threadSettingsUpdated';
      threadId: string;
      settings: ThreadSettings;
    }
  | {
      type: 'threadContextUsageUpdated';
      threadId: string;
      contextUsage: ThreadContextUsage;
    };

export interface ApiErrorPayload {
  error: {
    code?: BridgeAuthErrorCode;
    message: string;
  };
}
