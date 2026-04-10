import { BridgeClient } from "./bridgeClient.js";
import { applyThreadEvent, createInitialSnapshot, setThreadMessagePending, toThreadDetail, toThreadSummary, updateThreadSummaryState, upsertThreadSummary } from "./threadState.js";
export class BridgeThreadRuntime {
    client;
    #listeners = new Set();
    #pendingEvents = new Map();
    #snapshot = createInitialSnapshot();
    #unsubscribeEvents = null;
    constructor(client) {
        this.client = client;
    }
    getSnapshot = () => this.#snapshot;
    subscribe = (listener) => {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    };
    async loadThreads() {
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
        }
        catch (error) {
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
    async selectThread(threadId) {
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
                detail: { kind: "ready", thread }
            }));
        }
        catch (error) {
            if (this.#snapshot.selectedThreadId !== threadId) {
                return;
            }
            const message = toErrorMessage(error);
            if (message.includes("includeTurns is unavailable before first user message")) {
                const thread = await this.#resolveThreadSummary(threadId);
                if (thread) {
                    this.#update((current) => ({
                        ...current,
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
    async startThread(request = {}) {
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
        }
        catch (error) {
            this.#setActionError(error);
            throw error;
        }
        finally {
            this.#updateMutations({ startThreadPending: false });
        }
    }
    async sendMessage(threadId, text) {
        const nextText = text.trim();
        if (nextText.length === 0) {
            return;
        }
        const input = [{ type: "text", text: nextText }];
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
        }
        catch (error) {
            this.#setActionError(error);
            throw error;
        }
        finally {
            this.#updateMutations({ sendMessagePending: false });
        }
    }
    async interruptTurn(threadId, turnId) {
        this.#updateMutations({ interruptPending: true, lastError: null });
        try {
            await this.client.interruptTurn({ threadId, turnId });
        }
        catch (error) {
            this.#setActionError(error);
            throw error;
        }
        finally {
            this.#updateMutations({ interruptPending: false });
        }
    }
    dispose() {
        this.#disconnectEvents();
        this.#pendingEvents.clear();
    }
    #applyStartedTurn(threadId, turn) {
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
    #connectEvents(threadId) {
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
    #disconnectEvents() {
        this.#unsubscribeEvents?.();
        this.#unsubscribeEvents = null;
    }
    #showSelectedThread(thread) {
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
    #applyEventToDetail(detail, selectedThreadId, event) {
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
    #drainPendingEvents(threadId, thread) {
        const queuedEvents = this.#pendingEvents.get(threadId) ?? [];
        this.#pendingEvents.delete(threadId);
        return queuedEvents.reduce((currentThread, event) => applyThreadEvent(currentThread, event), thread);
    }
    #findThreadSummary(threadId) {
        if (this.#snapshot.threads.kind !== "ready") {
            return null;
        }
        return this.#snapshot.threads.threads.find((thread) => thread.id === threadId) ?? null;
    }
    async #resolveThreadSummary(threadId) {
        const existing = this.#findThreadSummary(threadId);
        if (existing) {
            return existing;
        }
        const response = await this.client.listThreads();
        let matchedThread = null;
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
    #setActionError(error) {
        this.#updateMutations({ lastError: toErrorMessage(error) });
    }
    #updateMutations(next) {
        this.#update((current) => ({
            ...current,
            mutations: {
                ...current.mutations,
                ...next
            }
        }));
    }
    #update(updater) {
        this.#snapshot = updater(this.#snapshot);
        for (const listener of this.#listeners) {
            listener();
        }
    }
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : "Unknown client error";
}
