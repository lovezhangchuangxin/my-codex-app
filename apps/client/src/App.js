import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
const bridgeBaseUrl = import.meta.env.VITE_BRIDGE_BASE_URL ?? "http://127.0.0.1:8787";
const bridgeAccessToken = import.meta.env.VITE_BRIDGE_ACCESS_TOKEN ?? "";
export function App() {
    const [state, setState] = useState({ kind: "loading" });
    const [detailState, setDetailState] = useState({ kind: "idle" });
    const pendingEventsRef = useRef(new Map());
    const [selectedThreadId, setSelectedThreadId] = useState(() => {
        const url = new URL(window.location.href);
        return url.searchParams.get("threadId");
    });
    useEffect(() => {
        let cancelled = false;
        async function loadThreads() {
            try {
                const response = await fetch(bridgeUrl("/api/threads"));
                if (!response.ok) {
                    const payload = (await response.json());
                    throw new Error(payload.error?.message ?? `Bridge request failed with ${response.status}`);
                }
                const payload = (await response.json());
                if (!cancelled) {
                    setState({ kind: "ready", threads: payload.data });
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown client error";
                if (!cancelled) {
                    setState({ kind: "error", message });
                }
            }
        }
        void loadThreads();
        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        if (!selectedThreadId) {
            setDetailState({ kind: "idle" });
            return;
        }
        const threadId = selectedThreadId;
        let cancelled = false;
        setDetailState({ kind: "loading", threadId });
        pendingEventsRef.current.set(threadId, []);
        async function loadThread() {
            try {
                const response = await fetch(bridgeUrl(`/api/threads/${encodeURIComponent(threadId)}`));
                if (!response.ok) {
                    const payload = (await response.json());
                    throw new Error(payload.error?.message ?? `Bridge request failed with ${response.status}`);
                }
                const payload = (await response.json());
                if (!cancelled) {
                    const queuedEvents = pendingEventsRef.current.get(threadId) ?? [];
                    pendingEventsRef.current.delete(threadId);
                    const nextThread = queuedEvents.reduce((currentThread, event) => applyThreadEvent(currentThread, event), payload.thread);
                    setDetailState({ kind: "ready", thread: nextThread });
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown client error";
                if (!cancelled) {
                    setDetailState({ kind: "error", threadId, message });
                }
            }
        }
        void loadThread();
        return () => {
            cancelled = true;
            pendingEventsRef.current.delete(threadId);
        };
    }, [selectedThreadId]);
    useEffect(() => {
        if (!selectedThreadId) {
            return;
        }
        const eventSource = new EventSource(bridgeUrl(`/api/events?threadId=${encodeURIComponent(selectedThreadId)}`));
        eventSource.onmessage = (message) => {
            const payload = JSON.parse(message.data);
            if (payload.type === "connected") {
                return;
            }
            if (payload.type === "error") {
                setDetailState({ kind: "error", threadId: selectedThreadId, message: payload.message });
                return;
            }
            setState((current) => applyThreadSummaryEvent(current, payload));
            setDetailState((current) => {
                if (current.kind !== "ready") {
                    const queued = pendingEventsRef.current.get(selectedThreadId) ?? [];
                    pendingEventsRef.current.set(selectedThreadId, [...queued, payload]);
                    return current;
                }
                return applyThreadDetailEvent(current, payload, selectedThreadId);
            });
        };
        return () => {
            eventSource.close();
        };
    }, [selectedThreadId]);
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("section", { className: "hero-panel", children: [_jsx("p", { className: "eyebrow", children: "Local-first Codex access" }), _jsx("h1", { children: "My Codex App" }), _jsx("p", { className: "lede", children: "Shared Web client first, desktop bridge as the sole Codex integration point." })] }), _jsxs("section", { className: "workspace-grid", children: [_jsxs("section", { className: "threads-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Threads" }), _jsxs("span", { className: "bridge-chip", children: ["Bridge: ", bridgeBaseUrl] })] }), state.kind === "loading" ? _jsx("p", { className: "status-line", children: "Loading thread list\u2026" }) : null, state.kind === "error" ? _jsx("p", { className: "status-line error", children: state.message }) : null, state.kind === "ready" ? (state.threads.length > 0 ? (_jsx("ul", { className: "thread-list", children: state.threads.map((thread) => (_jsxs("li", { className: `thread-card ${selectedThreadId === thread.id ? "thread-card-selected" : ""}`, children: [_jsxs("div", { className: "thread-card-top", children: [_jsx("strong", { children: thread.name ?? (thread.preview || "Untitled thread") }), _jsx("span", { className: `status-tag status-${thread.status.type}`, children: formatStatus(thread.status) })] }), _jsx("p", { children: thread.preview || "No preview yet." }), _jsxs("dl", { className: "thread-meta", children: [_jsxs("div", { children: [_jsx("dt", { children: "CWD" }), _jsx("dd", { children: thread.cwd })] }), _jsxs("div", { children: [_jsx("dt", { children: "Provider" }), _jsx("dd", { children: thread.modelProvider })] }), _jsxs("div", { children: [_jsx("dt", { children: "Updated" }), _jsx("dd", { children: new Date(thread.updatedAt * 1000).toLocaleString() })] })] }), _jsx("button", { className: "thread-open-button", onClick: () => {
                                                setSelectedThreadId(thread.id);
                                                const url = new URL(window.location.href);
                                                url.searchParams.set("threadId", thread.id);
                                                window.history.replaceState({}, "", url);
                                            }, type: "button", children: "Open thread" })] }, thread.id))) })) : (_jsx("p", { className: "status-line", children: "No threads returned by the bridge." }))) : null] }), _jsxs("section", { className: "threads-panel detail-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Thread Detail" }), selectedThreadId ? _jsxs("span", { className: "bridge-chip", children: ["Selected: ", selectedThreadId] }) : null] }), detailState.kind === "idle" ? (_jsx("p", { className: "status-line", children: "Select a thread to read full history from the bridge." })) : null, detailState.kind === "loading" ? (_jsx("p", { className: "status-line", children: "Loading thread detail\u2026" })) : null, detailState.kind === "error" ? (_jsx("p", { className: "status-line error", children: detailState.message })) : null, detailState.kind === "ready" ? _jsx(ThreadDetailPanel, { thread: detailState.thread }) : null] })] })] }));
}
function ThreadDetailPanel({ thread }) {
    return (_jsxs("div", { className: "thread-detail", children: [_jsxs("div", { className: "thread-detail-header", children: [_jsx("h3", { children: thread.name ?? (thread.preview || thread.id) }), _jsx("p", { children: thread.cwd })] }), thread.turns.length === 0 ? (_jsx("p", { className: "status-line", children: "No turns were returned for this thread." })) : (_jsx("ol", { className: "turn-list", children: thread.turns.map((turn) => (_jsxs("li", { className: "turn-card", children: [_jsxs("div", { className: "turn-header", children: [_jsx("strong", { children: turn.id }), _jsx("span", { className: `status-tag status-${turn.status}`, children: turn.status })] }), _jsxs("p", { className: "turn-meta", children: ["Started: ", formatTimestamp(turn.startedAt), " | Completed: ", formatTimestamp(turn.completedAt)] }), turn.error ? _jsx("p", { className: "status-line error", children: turn.error.message }) : null, _jsx("div", { className: "item-list", children: turn.items.map((item) => (_jsxs("article", { className: "item-card", children: [_jsxs("div", { className: "item-header", children: [_jsx("strong", { children: item.type }), _jsx("span", { children: item.id })] }), _jsx(ThreadItemBody, { item: item })] }, item.id))) })] }, turn.id))) }))] }));
}
function ThreadItemBody({ item }) {
    switch (item.type) {
        case "userMessage":
            return (_jsx("div", { className: "item-body", children: item.content.map((input, index) => (_jsx("p", { children: formatUserInput(input) }, `${item.id}-${index}`))) }));
        case "agentMessage":
            return _jsx("p", { className: "item-body", children: item.text || "No text." });
        case "reasoning":
            return (_jsxs("div", { className: "item-body", children: [item.summary.map((summary, index) => (_jsx("p", { children: summary }, `${item.id}-summary-${index}`))), item.content.map((content, index) => (_jsx("pre", { children: content }, `${item.id}-content-${index}`)))] }));
        case "commandExecution":
            return (_jsxs("div", { className: "item-body", children: [_jsx("p", { children: item.command }), _jsx("p", { children: item.cwd }), item.aggregatedOutput ? _jsx("pre", { children: item.aggregatedOutput }) : null] }));
        case "fileChange":
            return (_jsx("div", { className: "item-body", children: item.changes.map((change, index) => (_jsx("p", { children: change.path }, `${item.id}-change-${index}`))) }));
        case "webSearch":
            return _jsx("p", { className: "item-body", children: item.query });
        case "imageView":
            return _jsx("p", { className: "item-body", children: item.path });
        case "unknown":
            return _jsx("pre", { className: "item-body", children: JSON.stringify(item.raw, null, 2) });
    }
}
function formatStatus(threadStatus) {
    if (threadStatus.type !== "active") {
        return threadStatus.type;
    }
    if (threadStatus.activeFlags.length === 0) {
        return "active";
    }
    return `active: ${threadStatus.activeFlags.join(", ")}`;
}
function formatTimestamp(value) {
    return value ? new Date(value * 1000).toLocaleString() : "n/a";
}
function formatUserInput(input) {
    switch (input.type) {
        case "text":
            return input.text;
        case "image":
            return `image: ${input.url}`;
        case "localImage":
            return `localImage: ${input.path}`;
        case "skill":
            return `skill: ${input.name} (${input.path})`;
        case "mention":
            return `mention: ${input.name} (${input.path})`;
    }
}
function applyThreadSummaryEvent(state, event) {
    if (state.kind !== "ready") {
        return state;
    }
    if (event.type !== "threadStatusChanged") {
        return state;
    }
    return {
        kind: "ready",
        threads: state.threads.map((thread) => thread.id === event.threadId ? { ...thread, status: event.status } : thread)
    };
}
function applyThreadDetailEvent(state, event, selectedThreadId) {
    if (event.threadId !== selectedThreadId) {
        return state;
    }
    if (state.kind !== "ready") {
        return state;
    }
    switch (event.type) {
        case "threadStatusChanged":
            return {
                kind: "ready",
                thread: {
                    ...applyThreadEvent(state.thread, event)
                }
            };
        case "turnStarted":
        case "turnCompleted":
        case "itemStarted":
        case "itemCompleted":
        case "agentMessageDelta":
            return {
                kind: "ready",
                thread: applyThreadEvent(state.thread, event)
            };
    }
}
function upsertTurn(turns, nextTurn) {
    const found = turns.some((turn) => turn.id === nextTurn.id);
    if (found) {
        return turns.map((turn) => turn.id === nextTurn.id
            ? {
                ...turn,
                ...nextTurn,
                items: nextTurn.items.length > 0 ? nextTurn.items : turn.items
            }
            : turn);
    }
    return [...turns, nextTurn];
}
function upsertItem(items, nextItem) {
    const found = items.some((item) => item.id === nextItem.id);
    if (found) {
        return items.map((item) => (item.id === nextItem.id ? nextItem : item));
    }
    return [...items, nextItem];
}
function toActiveStatus(current) {
    if (current.type === "active") {
        return current;
    }
    return { type: "active", activeFlags: [] };
}
function applyThreadEvent(thread, event) {
    switch (event.type) {
        case "threadStatusChanged":
            return {
                ...thread,
                status: event.status
            };
        case "turnStarted":
            return {
                ...thread,
                status: toActiveStatus(thread.status),
                turns: upsertTurn(thread.turns, event.turn)
            };
        case "turnCompleted":
            return {
                ...thread,
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
                        items: turn.items.map((item) => item.type === "agentMessage" && item.id === event.itemId
                            ? { ...item, text: `${item.text}${event.delta}` }
                            : item)
                    }
                    : turn)
            };
    }
}
function bridgeUrl(path) {
    const base = new URL(path, bridgeBaseUrl);
    if (bridgeAccessToken) {
        base.searchParams.set("access_token", bridgeAccessToken);
    }
    return base.toString();
}
