import type {
  BridgeEvent,
  ThreadDetail,
  ThreadItem,
  ThreadListRequest,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadRuntimeStatus,
  ThreadSummary,
  TurnDetail,
  UserInput
} from "@my-codex-app/protocol";

import { AppServerClient } from "./appServerClient.js";

interface AppServerThread {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  modelProvider: string;
  status: {
    type: "notLoaded" | "idle" | "systemError" | "active";
    activeFlags?: Array<"waitingOnApproval" | "waitingOnUserInput">;
  };
  name?: string;
  turns?: AppServerTurn[];
}

interface AppServerTurn {
  id: string;
  status: "completed" | "interrupted" | "failed" | "inProgress";
  error?: {
    message: string;
    additionalDetails?: string;
  };
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  items: AppServerThreadItem[];
}

interface AppServerThreadItem {
  type: string;
  id: string;
  [key: string]: unknown;
}

export class ThreadService {
  constructor(private readonly appServerClient: AppServerClient) {}

  async listThreads(request: ThreadListRequest): Promise<ThreadListResponse> {
    const params = {
      ...(request.cursor !== undefined ? { cursor: request.cursor } : {}),
      ...(request.limit !== undefined ? { limit: request.limit } : {})
    };
    const result = await this.appServerClient.listThreads({
      ...params
    });

    return {
      data: result.data.map((thread) => this.#toThreadSummary(thread)),
      ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {})
    };
  }

  async readThread(threadId: string): Promise<ThreadReadResponse> {
    const result = await this.appServerClient.readThread(threadId);
    return {
      thread: this.#toThreadDetail(result.thread)
    };
  }

  async resumeThread(threadId: string): Promise<void> {
    await this.appServerClient.resumeThread(threadId);
  }

  async unsubscribeThread(threadId: string): Promise<void> {
    await this.appServerClient.unsubscribeThread(threadId);
  }

  onBridgeEvent(listener: (event: BridgeEvent) => void): () => void {
    const onNotification = (notification: { method: string; params?: unknown }) => {
      const event = this.#toBridgeEvent(notification.method, notification.params);
      if (event) {
        listener(event);
      }
    };

    this.appServerClient.on("notification", onNotification);
    return () => {
      this.appServerClient.off("notification", onNotification);
    };
  }

  #toThreadSummary(thread: AppServerThread): ThreadSummary {
    return {
      id: thread.id,
      preview: thread.preview,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      cwd: thread.cwd,
      modelProvider: thread.modelProvider,
      status: this.#toRuntimeStatus(thread.status),
      ...(thread.name !== undefined ? { name: thread.name } : {})
    };
  }

  #toThreadDetail(thread: AppServerThread): ThreadDetail {
    return {
      ...this.#toThreadSummary(thread),
      turns: (thread.turns ?? []).map((turn) => this.#toTurnDetail(turn))
    };
  }

  #toTurnDetail(turn: AppServerTurn): TurnDetail {
    return {
      id: turn.id,
      status: turn.status,
      ...(turn.startedAt !== undefined ? { startedAt: turn.startedAt } : {}),
      ...(turn.completedAt !== undefined ? { completedAt: turn.completedAt } : {}),
      ...(turn.durationMs !== undefined ? { durationMs: turn.durationMs } : {}),
      ...(turn.error
        ? {
            error: {
              message: turn.error.message,
              ...(turn.error.additionalDetails !== undefined
                ? { additionalDetails: turn.error.additionalDetails }
                : {})
            }
          }
        : {}),
      items: turn.items.map((item) => this.#toThreadItem(item))
    };
  }

  #toBridgeEvent(method: string, params: unknown): BridgeEvent | null {
    const payload = typeof params === "object" && params !== null ? (params as Record<string, unknown>) : null;
    if (!payload) {
      return null;
    }

    switch (method) {
      case "thread/status/changed": {
        const threadId = asString(payload.threadId);
        const status = this.#toRuntimeStatus(payload.status as AppServerThread["status"]);
        return threadId ? { type: "threadStatusChanged", threadId, status } : null;
      }
      case "turn/started": {
        const threadId = asString(payload.threadId);
        const turn = this.#toTurnDetail(payload.turn as AppServerTurn);
        return threadId ? { type: "turnStarted", threadId, turn } : null;
      }
      case "turn/completed": {
        const threadId = asString(payload.threadId);
        const turn = this.#toTurnDetail(payload.turn as AppServerTurn);
        return threadId ? { type: "turnCompleted", threadId, turn } : null;
      }
      case "item/started": {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const item = this.#toThreadItem(payload.item as AppServerThreadItem);
        return threadId && turnId ? { type: "itemStarted", threadId, turnId, item } : null;
      }
      case "item/completed": {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const item = this.#toThreadItem(payload.item as AppServerThreadItem);
        return threadId && turnId ? { type: "itemCompleted", threadId, turnId, item } : null;
      }
      case "item/agentMessage/delta": {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const itemId = asString(payload.itemId);
        const delta = asString(payload.delta);
        return threadId && turnId && itemId && delta !== null
          ? { type: "agentMessageDelta", threadId, turnId, itemId, delta }
          : null;
      }
      default:
        return null;
    }
  }

  #toThreadItem(item: AppServerThreadItem): ThreadItem {
    switch (item.type) {
      case "userMessage":
        return {
          type: "userMessage",
          id: item.id,
          content: Array.isArray(item.content)
            ? item.content.map((input) => this.#toUserInput(input as Record<string, unknown>))
            : []
        };
      case "agentMessage":
        return {
          type: "agentMessage",
          id: item.id,
          text: typeof item.text === "string" ? item.text : ""
        };
      case "reasoning":
        return {
          type: "reasoning",
          id: item.id,
          summary: Array.isArray(item.summary) ? item.summary.filter(isString) : [],
          content: Array.isArray(item.content) ? item.content.filter(isString) : []
        };
      case "commandExecution":
        return {
          type: "commandExecution",
          id: item.id,
          command: typeof item.command === "string" ? item.command : "",
          cwd: typeof item.cwd === "string" ? item.cwd : "",
          status: typeof item.status === "string" ? item.status : "unknown",
          ...(typeof item.aggregatedOutput === "string"
            ? { aggregatedOutput: item.aggregatedOutput }
            : {}),
          ...(typeof item.exitCode === "number" ? { exitCode: item.exitCode } : {}),
          ...(typeof item.durationMs === "number" ? { durationMs: item.durationMs } : {})
        };
      case "fileChange":
        return {
          type: "fileChange",
          id: item.id,
          status: typeof item.status === "string" ? item.status : "unknown",
          changes: Array.isArray(item.changes)
            ? item.changes.map((change) => {
                const next =
                  typeof change === "object" && change !== null
                    ? (change as Record<string, unknown>)
                    : {};
                return {
                  path: typeof next.path === "string" ? next.path : "unknown",
                  ...(typeof next.kind === "string" ? { kind: next.kind } : {}),
                  ...(typeof next.diff === "string" ? { diff: next.diff } : {})
                };
              })
            : []
        };
      case "webSearch":
        return {
          type: "webSearch",
          id: item.id,
          query: typeof item.query === "string" ? item.query : ""
        };
      case "imageView":
        return {
          type: "imageView",
          id: item.id,
          path: typeof item.path === "string" ? item.path : ""
        };
      default:
        return {
          type: "unknown",
          id: item.id,
          title: item.type,
          raw: item
        };
    }
  }

  #toUserInput(input: Record<string, unknown>): UserInput {
    switch (input.type) {
      case "text":
        return { type: "text", text: typeof input.text === "string" ? input.text : "" };
      case "image":
        return { type: "image", url: typeof input.url === "string" ? input.url : "" };
      case "localImage":
        return { type: "localImage", path: typeof input.path === "string" ? input.path : "" };
      case "skill":
        return {
          type: "skill",
          name: typeof input.name === "string" ? input.name : "",
          path: typeof input.path === "string" ? input.path : ""
        };
      case "mention":
        return {
          type: "mention",
          name: typeof input.name === "string" ? input.name : "",
          path: typeof input.path === "string" ? input.path : ""
        };
      default:
        return { type: "text", text: "" };
    }
  }

  #toRuntimeStatus(status: AppServerThread["status"]): ThreadRuntimeStatus {
    switch (status.type) {
      case "notLoaded":
        return { type: "notLoaded" };
      case "idle":
        return { type: "idle" };
      case "systemError":
        return { type: "systemError" };
      case "active":
        return {
          type: "active",
          activeFlags: status.activeFlags ?? []
        };
    }
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
