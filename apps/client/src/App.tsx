import { useEffect, useRef, useState } from "react";

import type {
  ThreadDetail,
  ThreadItem,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadSummary,
  UserInput,
  BridgeEvent,
  ThreadRuntimeStatus
} from "@my-codex-app/protocol";

const bridgeBaseUrl = import.meta.env.VITE_BRIDGE_BASE_URL ?? "http://127.0.0.1:8787";
const bridgeAccessToken = import.meta.env.VITE_BRIDGE_ACCESS_TOKEN ?? "";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; threads: ThreadSummary[] }
  | { kind: "error"; message: string };

type DetailState =
  | { kind: "idle" }
  | { kind: "loading"; threadId: string }
  | { kind: "ready"; thread: ThreadDetail }
  | { kind: "error"; threadId: string; message: string };

export function App() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [detailState, setDetailState] = useState<DetailState>({ kind: "idle" });
  const pendingEventsRef = useRef(new Map<string, BridgeEvent[]>());
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("threadId");
  });

  useEffect(() => {
    let cancelled = false;

    async function loadThreads(): Promise<void> {
      try {
        const response = await fetch(bridgeUrl("/api/threads"));
        if (!response.ok) {
          const payload = (await response.json()) as { error?: { message?: string } };
          throw new Error(payload.error?.message ?? `Bridge request failed with ${response.status}`);
        }
        const payload = (await response.json()) as ThreadListResponse;
        if (!cancelled) {
          setState({ kind: "ready", threads: payload.data });
        }
      } catch (error) {
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

    async function loadThread(): Promise<void> {
      try {
        const response = await fetch(bridgeUrl(`/api/threads/${encodeURIComponent(threadId)}`));
        if (!response.ok) {
          const payload = (await response.json()) as { error?: { message?: string } };
          throw new Error(payload.error?.message ?? `Bridge request failed with ${response.status}`);
        }
        const payload = (await response.json()) as ThreadReadResponse;
        if (!cancelled) {
          const queuedEvents = pendingEventsRef.current.get(threadId) ?? [];
          pendingEventsRef.current.delete(threadId);
          const nextThread = queuedEvents.reduce(
            (currentThread, event) => applyThreadEvent(currentThread, event),
            payload.thread
          );
          setDetailState({ kind: "ready", thread: nextThread });
        }
      } catch (error) {
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

    const eventSource = new EventSource(
      bridgeUrl(`/api/events?threadId=${encodeURIComponent(selectedThreadId)}`)
    );

    eventSource.onmessage = (message) => {
      const payload = JSON.parse(message.data) as BridgeEvent | { type: "connected" } | { type: "error"; message: string };
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

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Local-first Codex access</p>
        <h1>My Codex App</h1>
        <p className="lede">
          Shared Web client first, desktop bridge as the sole Codex integration point.
        </p>
      </section>
      <section className="workspace-grid">
        <section className="threads-panel">
        <div className="panel-header">
          <h2>Threads</h2>
          <span className="bridge-chip">Bridge: {bridgeBaseUrl}</span>
        </div>
        {state.kind === "loading" ? <p className="status-line">Loading thread list…</p> : null}
        {state.kind === "error" ? <p className="status-line error">{state.message}</p> : null}
        {state.kind === "ready" ? (
          state.threads.length > 0 ? (
            <ul className="thread-list">
              {state.threads.map((thread) => (
                <li
                  className={`thread-card ${selectedThreadId === thread.id ? "thread-card-selected" : ""}`}
                  key={thread.id}
                >
                  <div className="thread-card-top">
                    <strong>{thread.name ?? (thread.preview || "Untitled thread")}</strong>
                    <span className={`status-tag status-${thread.status.type}`}>
                      {formatStatus(thread.status)}
                    </span>
                  </div>
                  <p>{thread.preview || "No preview yet."}</p>
                  <dl className="thread-meta">
                    <div>
                      <dt>CWD</dt>
                      <dd>{thread.cwd}</dd>
                    </div>
                    <div>
                      <dt>Provider</dt>
                      <dd>{thread.modelProvider}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{new Date(thread.updatedAt * 1000).toLocaleString()}</dd>
                    </div>
                  </dl>
                  <button
                    className="thread-open-button"
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      const url = new URL(window.location.href);
                      url.searchParams.set("threadId", thread.id);
                      window.history.replaceState({}, "", url);
                    }}
                    type="button"
                  >
                    Open thread
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status-line">No threads returned by the bridge.</p>
          )
        ) : null}
        </section>
        <section className="threads-panel detail-panel">
          <div className="panel-header">
            <h2>Thread Detail</h2>
            {selectedThreadId ? <span className="bridge-chip">Selected: {selectedThreadId}</span> : null}
          </div>
          {detailState.kind === "idle" ? (
            <p className="status-line">Select a thread to read full history from the bridge.</p>
          ) : null}
          {detailState.kind === "loading" ? (
            <p className="status-line">Loading thread detail…</p>
          ) : null}
          {detailState.kind === "error" ? (
            <p className="status-line error">{detailState.message}</p>
          ) : null}
          {detailState.kind === "ready" ? <ThreadDetailPanel thread={detailState.thread} /> : null}
        </section>
      </section>
    </main>
  );
}

function ThreadDetailPanel({ thread }: { thread: ThreadDetail }) {
  return (
    <div className="thread-detail">
      <div className="thread-detail-header">
        <h3>{thread.name ?? (thread.preview || thread.id)}</h3>
        <p>{thread.cwd}</p>
      </div>
      {thread.turns.length === 0 ? (
        <p className="status-line">No turns were returned for this thread.</p>
      ) : (
        <ol className="turn-list">
          {thread.turns.map((turn) => (
            <li className="turn-card" key={turn.id}>
              <div className="turn-header">
                <strong>{turn.id}</strong>
                <span className={`status-tag status-${turn.status}`}>{turn.status}</span>
              </div>
              <p className="turn-meta">
                Started: {formatTimestamp(turn.startedAt)} | Completed: {formatTimestamp(turn.completedAt)}
              </p>
              {turn.error ? <p className="status-line error">{turn.error.message}</p> : null}
              <div className="item-list">
                {turn.items.map((item) => (
                  <article className="item-card" key={item.id}>
                    <div className="item-header">
                      <strong>{item.type}</strong>
                      <span>{item.id}</span>
                    </div>
                    <ThreadItemBody item={item} />
                  </article>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ThreadItemBody({ item }: { item: ThreadItem }) {
  switch (item.type) {
    case "userMessage":
      return (
        <div className="item-body">
          {item.content.map((input, index) => (
            <p key={`${item.id}-${index}`}>{formatUserInput(input)}</p>
          ))}
        </div>
      );
    case "agentMessage":
      return <p className="item-body">{item.text || "No text."}</p>;
    case "reasoning":
      return (
        <div className="item-body">
          {item.summary.map((summary, index) => (
            <p key={`${item.id}-summary-${index}`}>{summary}</p>
          ))}
          {item.content.map((content, index) => (
            <pre key={`${item.id}-content-${index}`}>{content}</pre>
          ))}
        </div>
      );
    case "commandExecution":
      return (
        <div className="item-body">
          <p>{item.command}</p>
          <p>{item.cwd}</p>
          {item.aggregatedOutput ? <pre>{item.aggregatedOutput}</pre> : null}
        </div>
      );
    case "fileChange":
      return (
        <div className="item-body">
          {item.changes.map((change, index) => (
            <p key={`${item.id}-change-${index}`}>{change.path}</p>
          ))}
        </div>
      );
    case "webSearch":
      return <p className="item-body">{item.query}</p>;
    case "imageView":
      return <p className="item-body">{item.path}</p>;
    case "unknown":
      return <pre className="item-body">{JSON.stringify(item.raw, null, 2)}</pre>;
  }
}

function formatStatus(threadStatus: ThreadSummary["status"]): string {
  if (threadStatus.type !== "active") {
    return threadStatus.type;
  }

  if (threadStatus.activeFlags.length === 0) {
    return "active";
  }

  return `active: ${threadStatus.activeFlags.join(", ")}`;
}

function formatTimestamp(value: number | undefined): string {
  return value ? new Date(value * 1000).toLocaleString() : "n/a";
}

function formatUserInput(input: UserInput): string {
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

function applyThreadSummaryEvent(
  state: ViewState,
  event: BridgeEvent
): ViewState {
  if (state.kind !== "ready") {
    return state;
  }

  if (event.type !== "threadStatusChanged") {
    return state;
  }

  return {
    kind: "ready",
    threads: state.threads.map((thread) =>
      thread.id === event.threadId ? { ...thread, status: event.status } : thread
    )
  };
}

function applyThreadDetailEvent(
  state: DetailState,
  event: BridgeEvent,
  selectedThreadId: string
): DetailState {
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

function upsertTurn(turns: ThreadDetail["turns"], nextTurn: ThreadDetail["turns"][number]) {
  const found = turns.some((turn) => turn.id === nextTurn.id);
  if (found) {
    return turns.map((turn) =>
      turn.id === nextTurn.id
        ? {
            ...turn,
            ...nextTurn,
            items: nextTurn.items.length > 0 ? nextTurn.items : turn.items
          }
        : turn
    );
  }

  return [...turns, nextTurn];
}

function upsertItem(items: ThreadItem[], nextItem: ThreadItem): ThreadItem[] {
  const found = items.some((item) => item.id === nextItem.id);
  if (found) {
    return items.map((item) => (item.id === nextItem.id ? nextItem : item));
  }

  return [...items, nextItem];
}

function toActiveStatus(current: ThreadRuntimeStatus): ThreadRuntimeStatus {
  if (current.type === "active") {
    return current;
  }

  return { type: "active", activeFlags: [] };
}

function applyThreadEvent(thread: ThreadDetail, event: BridgeEvent): ThreadDetail {
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
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? { ...turn, items: upsertItem(turn.items, event.item) }
            : turn
        )
      };
    case "itemCompleted":
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? { ...turn, items: upsertItem(turn.items, event.item) }
            : turn
        )
      };
    case "agentMessageDelta":
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? {
                ...turn,
                items: turn.items.map((item) =>
                  item.type === "agentMessage" && item.id === event.itemId
                    ? { ...item, text: `${item.text}${event.delta}` }
                    : item
                )
              }
            : turn
        )
      };
  }
}

function bridgeUrl(path: string): string {
  const base = new URL(path, bridgeBaseUrl);
  if (bridgeAccessToken) {
    base.searchParams.set("access_token", bridgeAccessToken);
  }
  return base.toString();
}
