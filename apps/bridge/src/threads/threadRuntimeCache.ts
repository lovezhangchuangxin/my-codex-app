import type {
  BridgeEvent,
  JsonRpcRequestId,
  PendingRequest,
  ThreadContextUsage,
  ThreadDetail,
  ThreadItem,
  ThreadSettings,
  TurnDetail
} from "@my-codex-app/protocol";

import { PendingRequestState } from "../pendingRequestState";

type CommandExecutionItem = Extract<ThreadItem, { type: "commandExecution" }>;
type CachedCommandItem = { turnId: string; item: CommandExecutionItem };

export class ThreadRuntimeCache {
  readonly #pendingRequestState = new PendingRequestState();
  readonly #requestMethodById = new Map<string, string>();
  readonly #commandItemCache = new Map<string, Map<string, CachedCommandItem>>();
  readonly #threadCwdCache = new Map<string, string>();
  readonly #threadSettingsCache = new Map<string, ThreadSettings>();
  readonly #contextUsageCache = new Map<string, ThreadContextUsage>();

  listPendingRequests(threadId: string): PendingRequest[] {
    return this.#pendingRequestState.listForThread(threadId);
  }

  getPendingRequest(requestId: JsonRpcRequestId): PendingRequest | null {
    return this.#pendingRequestState.get(requestId);
  }

  upsertPendingRequest(request: PendingRequest, requestMethod: string): void {
    this.#pendingRequestState.upsert(request);
    this.#requestMethodById.set(toRequestKey(request.requestId), requestMethod);
  }

  resolvePendingRequest(requestId: JsonRpcRequestId): PendingRequest | null {
    this.#requestMethodById.delete(toRequestKey(requestId));
    return this.#pendingRequestState.resolve(requestId);
  }

  clearThreadPendingRequests(threadId: string): void {
    this.#pendingRequestState.clearThread(threadId);
  }

  getRequestMethod(requestId: JsonRpcRequestId): string | undefined {
    return this.#requestMethodById.get(toRequestKey(requestId));
  }

  setThreadCwd(threadId: string, cwd: string): void {
    this.#threadCwdCache.set(threadId, cwd);
  }

  getThreadCwd(threadId: string): string | undefined {
    return this.#threadCwdCache.get(threadId);
  }

  setThreadSettings(threadId: string, settings: ThreadSettings): void {
    this.#threadSettingsCache.set(threadId, settings);
  }

  getThreadSettings(threadId: string): ThreadSettings | null {
    return this.#threadSettingsCache.get(threadId) ?? null;
  }

  setContextUsage(threadId: string, contextUsage: ThreadContextUsage): void {
    this.#contextUsageCache.set(threadId, contextUsage);
  }

  getContextUsage(threadId: string): ThreadContextUsage | null {
    return this.#contextUsageCache.get(threadId) ?? null;
  }

  cacheCommandEvent(event: BridgeEvent): void {
    if (event.type !== "itemStarted" && event.type !== "itemCompleted") {
      return;
    }

    if (event.item.type !== "commandExecution") {
      return;
    }

    const { threadId, turnId, item } = event;
    let threadCache = this.#commandItemCache.get(threadId);
    if (!threadCache) {
      threadCache = new Map();
      this.#commandItemCache.set(threadId, threadCache);
    }

    const existing = threadCache.get(item.id);
    if (existing && event.type === "itemStarted") {
      return;
    }

    threadCache.set(item.id, { turnId, item });
  }

  mergeCachedCommandItems(threadId: string, thread: ThreadDetail): ThreadDetail {
    const threadCache = this.#commandItemCache.get(threadId);
    if (!threadCache || threadCache.size === 0) {
      return thread;
    }

    const turnMap = new Map(thread.turns.map((turn) => [turn.id, turn]));
    const itemIdsInTurns = new Set(thread.turns.flatMap((turn) => turn.items.map((item) => item.id)));

    for (const [itemId, cached] of threadCache) {
      if (itemIdsInTurns.has(itemId)) {
        continue;
      }

      const turn = turnMap.get(cached.turnId);
      if (!turn) {
        continue;
      }

      const updatedTurn: TurnDetail = {
        ...turn,
        items: [...turn.items, cached.item]
      };
      turnMap.set(cached.turnId, updatedTurn);
    }

    return {
      ...thread,
      turns: thread.turns.map((turn) => turnMap.get(turn.id) ?? turn)
    };
  }
}

function toRequestKey(requestId: JsonRpcRequestId): string {
  return typeof requestId === "string" ? `string:${requestId}` : `number:${requestId}`;
}
