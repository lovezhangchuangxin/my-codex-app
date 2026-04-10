export function createInitialSnapshot() {
    return {
        threads: { kind: "loading" },
        detail: { kind: "idle" },
        selectedThreadId: null,
        mutations: {
            startThreadPending: false,
            sendMessagePending: false,
            interruptPending: false,
            respondingRequestIds: [],
            lastError: null
        }
    };
}
export function toThreadDetail(thread) {
    return {
        ...thread,
        turns: []
    };
}
export function toThreadSummary(thread) {
    return {
        id: thread.id,
        preview: thread.preview,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        cwd: thread.cwd,
        modelProvider: thread.modelProvider,
        status: thread.status,
        pendingRequests: thread.pendingRequests,
        ...(thread.name !== undefined ? { name: thread.name } : {})
    };
}
export function upsertThreadSummary(threads, nextThread) {
    const found = threads.some((thread) => thread.id === nextThread.id);
    const nextThreads = found
        ? threads.map((thread) => (thread.id === nextThread.id ? nextThread : thread))
        : [...threads, nextThread];
    return sortThreads(nextThreads);
}
export function updateThreadSummaryState(state, event) {
    if (state.kind !== "ready") {
        return state;
    }
    switch (event.type) {
        case "threadStarted":
            return {
                kind: "ready",
                threads: upsertThreadSummary(state.threads, toThreadSummary(event.thread))
            };
        case "threadStatusChanged":
            return {
                kind: "ready",
                threads: sortThreads(state.threads.map((thread) => thread.id === event.threadId ? { ...thread, status: event.status } : thread))
            };
        case "turnStarted":
            return {
                kind: "ready",
                threads: sortThreads(state.threads.map((thread) => thread.id === event.threadId
                    ? {
                        ...thread,
                        status: toActiveStatus(thread.status),
                        updatedAt: event.turn.startedAt ?? thread.updatedAt
                    }
                    : thread))
            };
        case "itemStarted":
        case "itemCompleted":
            if (event.item.type !== "userMessage") {
                return state;
            }
            const userMessage = event.item;
            return {
                kind: "ready",
                threads: sortThreads(state.threads.map((thread) => thread.id === event.threadId
                    ? {
                        ...thread,
                        preview: previewFromUserInput(userMessage.content) ?? thread.preview,
                        updatedAt: nowInSeconds()
                    }
                    : thread))
            };
        case "turnCompleted":
        case "agentMessageDelta":
            return state;
        case "pendingRequestAdded":
            return {
                kind: "ready",
                threads: sortThreads(state.threads.map((thread) => thread.id === event.threadId
                    ? {
                        ...thread,
                        pendingRequests: upsertPendingRequest(thread.pendingRequests, event.request)
                    }
                    : thread))
            };
        case "pendingRequestResolved":
            return {
                kind: "ready",
                threads: sortThreads(state.threads.map((thread) => thread.id === event.threadId
                    ? {
                        ...thread,
                        pendingRequests: removePendingRequest(thread.pendingRequests, event.requestId)
                    }
                    : thread))
            };
    }
}
export function applyThreadEvent(thread, event) {
    switch (event.type) {
        case "threadStarted":
            return event.thread;
        case "threadStatusChanged":
            return {
                ...thread,
                status: event.status
            };
        case "turnStarted":
            return {
                ...thread,
                status: toActiveStatus(thread.status),
                updatedAt: event.turn.startedAt ?? thread.updatedAt,
                turns: upsertTurn(thread.turns, event.turn)
            };
        case "turnCompleted":
            return {
                ...thread,
                updatedAt: event.turn.completedAt ?? thread.updatedAt,
                turns: upsertTurn(thread.turns, event.turn)
            };
        case "itemStarted":
            return {
                ...thread,
                turns: thread.turns.map((turn) => turn.id === event.turnId
                    ? { ...turn, items: upsertItem(turn.items, event.item) }
                    : turn)
            };
        case "itemCompleted":
            return {
                ...thread,
                turns: thread.turns.map((turn) => turn.id === event.turnId
                    ? { ...turn, items: upsertItem(turn.items, event.item) }
                    : turn)
            };
        case "agentMessageDelta":
            return {
                ...thread,
                turns: thread.turns.map((turn) => turn.id === event.turnId
                    ? {
                        ...turn,
                        items: appendAgentMessageDelta(turn.items, event.itemId, event.delta)
                    }
                    : turn)
            };
        case "pendingRequestAdded":
            return {
                ...thread,
                pendingRequests: upsertPendingRequest(thread.pendingRequests, event.request)
            };
        case "pendingRequestResolved":
            return {
                ...thread,
                pendingRequests: removePendingRequest(thread.pendingRequests, event.requestId)
            };
    }
}
export function previewFromUserInput(inputs) {
    for (const input of inputs) {
        if (input.type === "text" && input.text.trim().length > 0) {
            return input.text.trim();
        }
    }
    return null;
}
export function findActiveTurnId(thread) {
    const activeTurn = [...thread.turns].reverse().find((turn) => turn.status === "inProgress");
    return activeTurn?.id ?? null;
}
export function setThreadMessagePending(threads, threadId, input) {
    const nextPreview = previewFromUserInput(input);
    return sortThreads(threads.map((thread) => thread.id === threadId
        ? {
            ...thread,
            preview: nextPreview ?? thread.preview,
            status: toActiveStatus(thread.status),
            updatedAt: nowInSeconds()
        }
        : thread));
}
function appendAgentMessageDelta(items, itemId, delta) {
    const found = items.some((item) => item.type === "agentMessage" && item.id === itemId);
    if (!found) {
        return [...items, { type: "agentMessage", id: itemId, text: delta }];
    }
    return items.map((item) => item.type === "agentMessage" && item.id === itemId
        ? { ...item, text: `${item.text}${delta}` }
        : item);
}
function sortThreads(threads) {
    return [...threads].sort((left, right) => {
        if (right.updatedAt !== left.updatedAt) {
            return right.updatedAt - left.updatedAt;
        }
        return right.createdAt - left.createdAt;
    });
}
function upsertTurn(turns, nextTurn) {
    const found = turns.some((turn) => turn.id === nextTurn.id);
    if (!found) {
        return [...turns, nextTurn];
    }
    return turns.map((turn) => turn.id === nextTurn.id
        ? {
            ...turn,
            ...nextTurn,
            items: nextTurn.items.length > 0 ? nextTurn.items : turn.items
        }
        : turn);
}
function upsertItem(items, nextItem) {
    const found = items.some((item) => item.id === nextItem.id);
    if (!found) {
        return [...items, nextItem];
    }
    return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}
function toActiveStatus(current) {
    if (current.type === "active") {
        return current;
    }
    return { type: "active", activeFlags: [] };
}
function upsertPendingRequest(pendingRequests, nextRequest) {
    const nextKey = toRequestKey(nextRequest.requestId);
    const remaining = pendingRequests.filter((request) => toRequestKey(request.requestId) !== nextKey);
    return [...remaining, nextRequest].sort((left, right) => left.requestedAt - right.requestedAt);
}
function removePendingRequest(pendingRequests, requestId) {
    const requestKey = toRequestKey(requestId);
    return pendingRequests.filter((request) => toRequestKey(request.requestId) !== requestKey);
}
function toRequestKey(requestId) {
    return typeof requestId === "string" ? `string:${requestId}` : `number:${requestId}`;
}
function nowInSeconds() {
    return Math.floor(Date.now() / 1000);
}
