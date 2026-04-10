export type ConnectionMode = "local" | "relay";

export type ClientConnectionState =
  | "connected"
  | "reconnecting"
  | "resynced"
  | "disconnected";

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

export type BridgeEvent =
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
    };

export interface ApiErrorPayload {
  error: {
    message: string;
  };
}
