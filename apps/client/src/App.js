import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BridgeClient, BridgeThreadRuntime, findActiveTurnId } from "@my-codex-app/sdk";
const bridgeBaseUrl = import.meta.env.VITE_BRIDGE_BASE_URL ?? "http://127.0.0.1:8787";
const bridgeAccessToken = import.meta.env.VITE_BRIDGE_ACCESS_TOKEN ?? "";
export function App() {
    const [runtime] = useState(() => new BridgeThreadRuntime(new BridgeClient({
        baseUrl: bridgeBaseUrl,
        accessToken: bridgeAccessToken
    })));
    const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
    const [composerText, setComposerText] = useState("");
    const activeTurnId = snapshot.detail.kind === "ready" ? findActiveTurnId(snapshot.detail.thread) : null;
    useEffect(() => {
        const initialThreadId = new URL(window.location.href).searchParams.get("threadId");
        void (async () => {
            await runtime.loadThreads();
            await runtime.selectThread(initialThreadId);
        })();
        return () => {
            runtime.dispose();
        };
    }, [runtime]);
    useEffect(() => {
        const url = new URL(window.location.href);
        if (snapshot.selectedThreadId) {
            url.searchParams.set("threadId", snapshot.selectedThreadId);
        }
        else {
            url.searchParams.delete("threadId");
        }
        window.history.replaceState({}, "", url);
    }, [snapshot.selectedThreadId]);
    async function handleStartThread() {
        try {
            await runtime.startThread();
            setComposerText("");
        }
        catch {
            // Surface the error through runtime mutation state.
        }
    }
    async function handleOpenThread(threadId) {
        setComposerText("");
        await runtime.selectThread(threadId);
    }
    async function handleSendMessage(event) {
        event.preventDefault();
        if (!snapshot.selectedThreadId) {
            return;
        }
        try {
            await runtime.sendMessage(snapshot.selectedThreadId, composerText);
            setComposerText("");
        }
        catch {
            // Surface the error through runtime mutation state.
        }
    }
    async function handleInterrupt() {
        if (!snapshot.selectedThreadId || !activeTurnId) {
            return;
        }
        try {
            await runtime.interruptTurn(snapshot.selectedThreadId, activeTurnId);
        }
        catch {
            // Surface the error through runtime mutation state.
        }
    }
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("section", { className: "hero-panel", children: [_jsx("p", { className: "eyebrow", children: "Local-first Codex access" }), _jsx("h1", { children: "My Codex App" }), _jsx("p", { className: "lede", children: "Shared Web client first, desktop bridge as the sole Codex integration point." })] }), _jsxs("section", { className: "workspace-grid", children: [_jsxs("section", { className: "threads-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Threads" }), _jsxs("span", { className: "bridge-chip", children: ["Bridge: ", bridgeBaseUrl] })] }), _jsx("div", { className: "panel-actions", children: _jsx("button", { className: "thread-open-button", disabled: snapshot.mutations.startThreadPending, onClick: () => {
                                        void handleStartThread();
                                    }, type: "button", children: snapshot.mutations.startThreadPending ? "Creating…" : "New thread" }) }), snapshot.threads.kind === "loading" ? (_jsx("p", { className: "status-line", children: "Loading thread list\u2026" })) : null, snapshot.threads.kind === "error" ? (_jsx("p", { className: "status-line error", children: snapshot.threads.message })) : null, snapshot.threads.kind === "ready" ? (snapshot.threads.threads.length > 0 ? (_jsx("ul", { className: "thread-list", children: snapshot.threads.threads.map((thread) => (_jsxs("li", { className: `thread-card ${snapshot.selectedThreadId === thread.id ? "thread-card-selected" : ""}`, children: [_jsxs("div", { className: "thread-card-top", children: [_jsx("strong", { children: thread.name ?? (thread.preview || "Untitled thread") }), _jsx("span", { className: `status-tag status-${thread.status.type}`, children: formatStatus(thread.status) })] }), _jsx("p", { children: thread.preview || "No preview yet." }), _jsxs("dl", { className: "thread-meta", children: [_jsxs("div", { children: [_jsx("dt", { children: "CWD" }), _jsx("dd", { children: thread.cwd })] }), _jsxs("div", { children: [_jsx("dt", { children: "Provider" }), _jsx("dd", { children: thread.modelProvider })] }), _jsxs("div", { children: [_jsx("dt", { children: "Updated" }), _jsx("dd", { children: new Date(thread.updatedAt * 1000).toLocaleString() })] })] }), _jsx("button", { className: "thread-open-button", onClick: () => {
                                                void handleOpenThread(thread.id);
                                            }, type: "button", children: "Open thread" })] }, thread.id))) })) : (_jsx("p", { className: "status-line", children: "No threads returned by the bridge." }))) : null] }), _jsxs("section", { className: "threads-panel detail-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Thread Detail" }), snapshot.selectedThreadId ? (_jsxs("span", { className: "bridge-chip", children: ["Selected: ", snapshot.selectedThreadId] })) : null] }), snapshot.mutations.lastError ? (_jsx("p", { className: "status-line error", children: snapshot.mutations.lastError })) : null, snapshot.selectedThreadId ? (_jsxs("form", { className: "composer-form", onSubmit: (event) => void handleSendMessage(event), children: [_jsx("textarea", { className: "composer-input", onChange: (event) => {
                                            setComposerText(event.target.value);
                                        }, placeholder: "Send a message to this thread", rows: 4, value: composerText }), _jsxs("div", { className: "composer-actions", children: [_jsx("button", { className: "thread-open-button", disabled: snapshot.mutations.sendMessagePending || composerText.trim().length === 0, type: "submit", children: snapshot.mutations.sendMessagePending ? "Sending…" : "Send message" }), activeTurnId ? (_jsx("button", { className: "secondary-button", disabled: snapshot.mutations.interruptPending, onClick: () => {
                                                    void handleInterrupt();
                                                }, type: "button", children: snapshot.mutations.interruptPending ? "Interrupting…" : "Interrupt turn" })) : null] })] })) : null, snapshot.detail.kind === "idle" ? (_jsx("p", { className: "status-line", children: "Select a thread to read full history from the bridge." })) : null, snapshot.detail.kind === "loading" ? (_jsx("p", { className: "status-line", children: "Loading thread detail\u2026" })) : null, snapshot.detail.kind === "error" ? (_jsx("p", { className: "status-line error", children: snapshot.detail.message })) : null, snapshot.detail.kind === "ready" ? _jsx(ThreadDetailPanel, { thread: snapshot.detail.thread }) : null] })] })] }));
}
function ThreadDetailPanel({ thread }) {
    return (_jsxs("div", { className: "thread-detail", children: [_jsxs("div", { className: "thread-detail-header", children: [_jsx("h3", { children: thread.name ?? (thread.preview || thread.id) }), _jsx("p", { children: thread.cwd })] }), thread.turns.length === 0 ? (_jsx("p", { className: "status-line", children: "No turns yet. Send the first message to materialize this thread." })) : (_jsx("ol", { className: "turn-list", children: thread.turns.map((turn) => (_jsxs("li", { className: "turn-card", children: [_jsxs("div", { className: "turn-header", children: [_jsx("strong", { children: turn.id }), _jsx("span", { className: `status-tag status-${turn.status}`, children: turn.status })] }), _jsxs("p", { className: "turn-meta", children: ["Started: ", formatTimestamp(turn.startedAt), " | Completed: ", formatTimestamp(turn.completedAt)] }), turn.error ? _jsx("p", { className: "status-line error", children: turn.error.message }) : null, _jsx("div", { className: "item-list", children: turn.items.map((item) => (_jsxs("article", { className: "item-card", children: [_jsxs("div", { className: "item-header", children: [_jsx("strong", { children: item.type }), _jsx("span", { children: item.id })] }), _jsx(ThreadItemBody, { item: item })] }, item.id))) })] }, turn.id))) }))] }));
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
