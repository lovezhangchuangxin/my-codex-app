export type ConnectionMode = "local" | "relay";

export type JsonRpcRequestId = string | number;

export type BridgeAuthErrorCode =
  | "missingCredentials"
  | "invalidAccessToken"
  | "expiredAccessToken"
  | "invalidRefreshToken"
  | "expiredRefreshToken"
  | "revokedDevice"
  | "invalidPairingCode"
  | "deviceIdConflict";

export type LocalConnectionStateKind =
  | "unpaired"
  | "refreshing"
  | "authenticated"
  | "reconnecting"
  | "resyncing"
  | "revoked"
  | "expired"
  | "disconnected";

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

export type ThreadRuntimeStatus =
  | { type: "notLoaded" }
  | { type: "idle" }
  | { type: "systemError" }
  | {
      type: "active";
      activeFlags: Array<"waitingOnApproval" | "waitingOnUserInput">;
    };

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

export type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

export interface TurnError {
  message: string;
  additionalDetails?: string;
}

export type UserInput =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "localImage"; path: string }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string };

export type ThreadItem =
  | { type: "userMessage"; id: string; content: UserInput[] }
  | { type: "agentMessage"; id: string; text: string }
  | { type: "reasoning"; id: string; summary: string[]; content: string[] }
  | {
      type: "commandExecution";
      id: string;
      command: string;
      cwd: string;
      status: string;
      aggregatedOutput?: string;
      exitCode?: number;
      durationMs?: number;
    }
  | {
      type: "fileChange";
      id: string;
      status: string;
      changes: Array<{ path: string; kind?: string; diff?: string }>;
    }
  | { type: "webSearch"; id: string; query: string }
  | { type: "imageView"; id: string; path: string }
  | { type: "unknown"; id: string; title: string; raw: unknown };

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
}

export type PendingRequestKind = "command" | "fileChange" | "permissions" | "userInput";

export type CommandApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type FileChangeApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type PermissionGrantScope = "turn" | "session";

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
  kind: "command";
  approvalId?: string;
  reason?: string;
  command?: string;
  cwd?: string;
}

export interface PendingFileChangeRequest extends PendingRequestBase {
  kind: "fileChange";
  reason?: string;
  grantRoot?: string;
}

export interface PendingPermissionsRequest extends PendingRequestBase {
  kind: "permissions";
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
  kind: "userInput";
  questions: PendingUserInputQuestion[];
}

export type PendingRequest =
  | PendingCommandRequest
  | PendingFileChangeRequest
  | PendingPermissionsRequest
  | PendingUserInputRequest;

export interface ThreadListRequest {
  limit?: number;
  cursor?: string;
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

export interface TurnStartRequest {
  threadId: string;
  input: UserInput[];
}

export interface TurnStartResponse {
  turn: TurnDetail;
}

export interface TurnInterruptRequest {
  threadId: string;
  turnId: string;
}

export interface TurnInterruptResponse {}

export type RequestRespondRequest =
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: "command";
        decision: CommandApprovalDecision;
      };
    }
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: "fileChange";
        decision: FileChangeApprovalDecision;
      };
    }
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: "permissions";
        permissions: GrantedPermissionProfile;
        scope: PermissionGrantScope;
      };
    }
  | {
      requestId: JsonRpcRequestId;
      response: {
        kind: "userInput";
        answers: Record<string, { answers: string[] }>;
      };
    };

export interface RequestRespondResponse {}

export type BridgeEvent =
  | {
      type: "threadStarted";
      threadId: string;
      thread: ThreadDetail;
    }
  | {
      type: "threadStatusChanged";
      threadId: string;
      status: ThreadRuntimeStatus;
    }
  | {
      type: "turnStarted";
      threadId: string;
      turn: TurnDetail;
    }
  | {
      type: "turnCompleted";
      threadId: string;
      turn: TurnDetail;
    }
  | {
      type: "itemStarted";
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "itemCompleted";
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "agentMessageDelta";
      threadId: string;
      turnId: string;
      itemId: string;
      delta: string;
    }
  | {
      type: "pendingRequestAdded";
      threadId: string;
      request: PendingRequest;
    }
  | {
      type: "pendingRequestResolved";
      threadId: string;
      requestId: JsonRpcRequestId;
    };

export interface ApiErrorPayload {
  error: {
    code?: BridgeAuthErrorCode;
    message: string;
  };
}
