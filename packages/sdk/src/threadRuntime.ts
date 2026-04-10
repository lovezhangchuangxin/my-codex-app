import type {
  BridgeEvent,
  JsonRpcRequestId,
  RequestRespondRequest,
  ThreadDetail,
  ThreadStartRequest,
  ThreadSummary,
  TurnDetail,
  UserInput
} from "@my-codex-app/protocol";

import { BridgeClient } from "./bridgeClient.js";
import {
  applyThreadEvent,
  createInitialSnapshot,
  setThreadMessagePending,
  toThreadDetail,
  toThreadSummary,
  type ThreadDetailState,
  type ThreadRuntimeSnapshot,
  updateThreadSummaryState,
  upsertThreadSummary
} from "./threadState.js";

type Listener = () => void;

export class BridgeThreadRuntime {
  readonly #listeners = new Set<Listener>();
  readonly #pendingEvents = new Map<string, BridgeEvent[]>();
  #snapshot: ThreadRuntimeSnapshot = createInitialSnapshot();
  #unsubscribeEvents: (() => void) | null = null;

  constructor(private readonly client: BridgeClient) {}

  getSnapshot = (): ThreadRuntimeSnapshot => this.#snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  async loadThreads(): Promise<void> {
    this.#update((current) => ({
      ...current,
      threads: current.threads.kind === "ready" ? current.threads : { kind: "loading" }
    }));

    try {
      const response = await this.client.listThreads();
      this.#update((current) => ({
        ...current,
        threads: {
          kind: "ready",
          threads: response.data
        }
      }));
    } catch (error) {
      this.#setActionError(error);
      this.#update((current) => ({
        ...current,
        threads: {
          kind: "error",
          message: toErrorMessage(error)
        }
      }));
    }
  }

  async selectThread(threadId: string | null): Promise<void> {
    if (threadId === this.#snapshot.selectedThreadId) {
      return;
    }

    this.#disconnectEvents();

    if (!threadId) {
      this.#pendingEvents.clear();
      this.#update((current) => ({
        ...current,
        selectedThreadId: null,
        detail: { kind: "idle" }
      }));
      return;
    }

    this.#pendingEvents.set(threadId, []);
    this.#update((current) => ({
      ...current,
      selectedThreadId: threadId,
      detail: { kind: "loading", threadId }
    }));
    this.#connectEvents(threadId);

    try {
      const response = await this.client.readThread(threadId);
      if (this.#snapshot.selectedThreadId !== threadId) {
        return;
      }

      const thread = this.#drainPendingEvents(threadId, response.thread);
      this.#update((current) => ({
        ...current,
        threads: current.threads.kind === "ready"
          ? {
              kind: "ready",
              threads: upsertThreadSummary(current.threads.threads, toThreadSummary(thread))
            }
          : current.threads,
        detail: { kind: "ready", thread }
      }));
    } catch (error) {
      if (this.#snapshot.selectedThreadId !== threadId) {
        return;
      }

      const message = toErrorMessage(error);
      if (message.includes("includeTurns is unavailable before first user message")) {
        const thread = await this.#resolveThreadSummary(threadId);
        if (thread) {
          this.#update((current) => ({
            ...current,
            threads: current.threads.kind === "ready"
              ? {
                  kind: "ready",
                  threads: upsertThreadSummary(current.threads.threads, thread)
                }
              : current.threads,
            detail: { kind: "ready", thread: this.#drainPendingEvents(threadId, toThreadDetail(thread)) }
          }));
          return;
        }
      }

      this.#setActionError(error);
      this.#update((current) => ({
        ...current,
        detail: { kind: "error", threadId, message }
      }));
    }
  }

  async startThread(request: ThreadStartRequest = {}): Promise<string> {
    this.#updateMutations({ startThreadPending: true, lastError: null });

    try {
      const response = await this.client.startThread(request);
      const thread = response.thread;
      this.#update((current) => ({
        ...current,
        threads: current.threads.kind === "ready"
          ? {
              kind: "ready",
              threads: upsertThreadSummary(current.threads.threads, toThreadSummary(thread))
            }
          : {
              kind: "ready",
              threads: [toThreadSummary(thread)]
            }
      }));

      this.#showSelectedThread(thread);
      return thread.id;
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#updateMutations({ startThreadPending: false });
    }
  }

  async sendMessage(threadId: string, text: string): Promise<void> {
    const nextText = text.trim();
    if (nextText.length === 0) {
      return;
    }

    const input: UserInput[] = [{ type: "text", text: nextText }];
    this.#updateMutations({ sendMessagePending: true, lastError: null });

    try {
      const response = await this.client.startTurn({ threadId, input });

      this.#update((current) => ({
        ...current,
        threads: current.threads.kind === "ready"
          ? {
              kind: "ready",
              threads: setThreadMessagePending(current.threads.threads, threadId, input)
            }
          : current.threads
      }));

      this.#applyStartedTurn(threadId, response.turn);
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#updateMutations({ sendMessagePending: false });
    }
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    this.#updateMutations({ interruptPending: true, lastError: null });

    try {
      await this.client.interruptTurn({ threadId, turnId });
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#updateMutations({ interruptPending: false });
    }
  }

  async respondToRequest(request: RequestRespondRequest): Promise<void> {
    this.#setPendingRequestResponse(request.requestId, true);
    this.#updateMutations({ lastError: null });

    try {
      await this.client.respondToRequest(request);
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#setPendingRequestResponse(request.requestId, false);
    }
  }

  dispose(): void {
    this.#disconnectEvents();
    this.#pendingEvents.clear();
  }

  #applyStartedTurn(threadId: string, turn: TurnDetail): void {
    if (this.#snapshot.selectedThreadId !== threadId) {
      return;
    }

    const currentDetail = this.#snapshot.detail;
    if (currentDetail.kind === "ready" && currentDetail.thread.id === threadId) {
      this.#update((current) => ({
        ...current,
        detail: {
          kind: "ready",
          thread: applyThreadEvent(currentDetail.thread, {
            type: "turnStarted",
            threadId,
            turn
          })
        }
      }));
      return;
    }

    const thread = this.#findThreadSummary(threadId);
    if (!thread) {
      return;
    }

    this.#update((current) => ({
      ...current,
      detail: {
        kind: "ready",
        thread: applyThreadEvent(toThreadDetail(thread), {
          type: "turnStarted",
          threadId,
          turn
        })
      }
    }));
  }

  #connectEvents(threadId: string): void {
    this.#unsubscribeEvents = this.client.subscribeToThreadEvents(threadId, {
      onEvent: (event) => {
        this.#update((current) => ({
          ...current,
          threads: updateThreadSummaryState(current.threads, event),
          detail: this.#applyEventToDetail(current.detail, current.selectedThreadId, event)
        }));
      },
      onError: (message) => {
        if (this.#snapshot.selectedThreadId !== threadId) {
          return;
        }

        const detail = this.#snapshot.detail;
        if (detail.kind === "ready") {
          return;
        }

        this.#update((current) => ({
          ...current,
          detail: { kind: "error", threadId, message }
        }));
      }
    });
  }

  #disconnectEvents(): void {
    this.#unsubscribeEvents?.();
    this.#unsubscribeEvents = null;
  }

  #showSelectedThread(thread: ThreadDetail): void {
    this.#disconnectEvents();
    this.#pendingEvents.set(thread.id, []);
    this.#update((current) => ({
      ...current,
      selectedThreadId: thread.id,
      detail: {
        kind: "ready",
        thread
      }
    }));
    this.#connectEvents(thread.id);
  }

  #applyEventToDetail(
    detail: ThreadDetailState,
    selectedThreadId: string | null,
    event: BridgeEvent
  ): ThreadDetailState {
    if (selectedThreadId !== event.threadId) {
      return detail;
    }

    if (detail.kind !== "ready") {
      const queued = this.#pendingEvents.get(event.threadId) ?? [];
      this.#pendingEvents.set(event.threadId, [...queued, event]);
      return detail;
    }

    return {
      kind: "ready",
      thread: applyThreadEvent(detail.thread, event)
    };
  }

  #drainPendingEvents(threadId: string, thread: ThreadDetail): ThreadDetail {
    const queuedEvents = this.#pendingEvents.get(threadId) ?? [];
    this.#pendingEvents.delete(threadId);
    return queuedEvents.reduce((currentThread, event) => applyThreadEvent(currentThread, event), thread);
  }

  #findThreadSummary(threadId: string): ThreadSummary | null {
    if (this.#snapshot.threads.kind !== "ready") {
      return null;
    }

    return this.#snapshot.threads.threads.find((thread) => thread.id === threadId) ?? null;
  }

  async #resolveThreadSummary(threadId: string): Promise<ThreadSummary | null> {
    const existing = this.#findThreadSummary(threadId);
    if (existing) {
      return existing;
    }

    const response = await this.client.listThreads();
    let matchedThread: ThreadSummary | null = null;

    this.#update((current) => {
      const nextThreads = response.data;
      matchedThread = nextThreads.find((thread) => thread.id === threadId) ?? null;
      return {
        ...current,
        threads: {
          kind: "ready",
          threads: nextThreads
        }
      };
    });

    return matchedThread;
  }

  #setActionError(error: unknown): void {
    this.#updateMutations({ lastError: toErrorMessage(error) });
  }

  #updateMutations(next: Partial<ThreadRuntimeSnapshot["mutations"]>): void {
    this.#update((current) => ({
      ...current,
      mutations: {
        ...current.mutations,
        ...next
      }
    }));
  }

  #setPendingRequestResponse(requestId: JsonRpcRequestId, isPending: boolean): void {
    const requestKey = toRequestKey(requestId);
    this.#update((current) => {
      const nextIds = isPending
        ? current.mutations.respondingRequestIds.some((id) => toRequestKey(id) === requestKey)
          ? current.mutations.respondingRequestIds
          : [...current.mutations.respondingRequestIds, requestId]
        : current.mutations.respondingRequestIds.filter((id) => toRequestKey(id) !== requestKey);

      return {
        ...current,
        mutations: {
          ...current.mutations,
          respondingRequestIds: nextIds
        }
      };
    });
  }

  #update(updater: (current: ThreadRuntimeSnapshot) => ThreadRuntimeSnapshot): void {
    this.#snapshot = updater(this.#snapshot);
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown client error";
}

function toRequestKey(requestId: JsonRpcRequestId): string {
  return typeof requestId === "string" ? `string:${requestId}` : `number:${requestId}`;
}
