import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

import type { ThreadDetail, ThreadItem, ThreadSummary, UserInput } from "@my-codex-app/protocol";
import { BridgeClient, BridgeThreadRuntime, findActiveTurnId } from "@my-codex-app/sdk";

const bridgeBaseUrl = import.meta.env.VITE_BRIDGE_BASE_URL ?? "http://127.0.0.1:8787";
const bridgeAccessToken = import.meta.env.VITE_BRIDGE_ACCESS_TOKEN ?? "";

export function App() {
  const [runtime] = useState(
    () =>
      new BridgeThreadRuntime(
        new BridgeClient({
          baseUrl: bridgeBaseUrl,
          accessToken: bridgeAccessToken
        })
      )
  );
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const [composerText, setComposerText] = useState("");
  const activeTurnId =
    snapshot.detail.kind === "ready" ? findActiveTurnId(snapshot.detail.thread) : null;

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
    } else {
      url.searchParams.delete("threadId");
    }
    window.history.replaceState({}, "", url);
  }, [snapshot.selectedThreadId]);

  async function handleStartThread(): Promise<void> {
    try {
      await runtime.startThread();
      setComposerText("");
    } catch {
      // Surface the error through runtime mutation state.
    }
  }

  async function handleOpenThread(threadId: string): Promise<void> {
    setComposerText("");
    await runtime.selectThread(threadId);
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!snapshot.selectedThreadId) {
      return;
    }

    try {
      await runtime.sendMessage(snapshot.selectedThreadId, composerText);
      setComposerText("");
    } catch {
      // Surface the error through runtime mutation state.
    }
  }

  async function handleInterrupt(): Promise<void> {
    if (!snapshot.selectedThreadId || !activeTurnId) {
      return;
    }

    try {
      await runtime.interruptTurn(snapshot.selectedThreadId, activeTurnId);
    } catch {
      // Surface the error through runtime mutation state.
    }
  }

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
          <div className="panel-actions">
            <button
              className="thread-open-button"
              disabled={snapshot.mutations.startThreadPending}
              onClick={() => {
                void handleStartThread();
              }}
              type="button"
            >
              {snapshot.mutations.startThreadPending ? "Creating…" : "New thread"}
            </button>
          </div>
          {snapshot.threads.kind === "loading" ? (
            <p className="status-line">Loading thread list…</p>
          ) : null}
          {snapshot.threads.kind === "error" ? (
            <p className="status-line error">{snapshot.threads.message}</p>
          ) : null}
          {snapshot.threads.kind === "ready" ? (
            snapshot.threads.threads.length > 0 ? (
              <ul className="thread-list">
                {snapshot.threads.threads.map((thread) => (
                  <li
                    className={`thread-card ${snapshot.selectedThreadId === thread.id ? "thread-card-selected" : ""}`}
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
                        void handleOpenThread(thread.id);
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
            {snapshot.selectedThreadId ? (
              <span className="bridge-chip">Selected: {snapshot.selectedThreadId}</span>
            ) : null}
          </div>
          {snapshot.mutations.lastError ? (
            <p className="status-line error">{snapshot.mutations.lastError}</p>
          ) : null}
          {snapshot.selectedThreadId ? (
            <form className="composer-form" onSubmit={(event) => void handleSendMessage(event)}>
              <textarea
                className="composer-input"
                onChange={(event) => {
                  setComposerText(event.target.value);
                }}
                placeholder="Send a message to this thread"
                rows={4}
                value={composerText}
              />
              <div className="composer-actions">
                <button
                  className="thread-open-button"
                  disabled={snapshot.mutations.sendMessagePending || composerText.trim().length === 0}
                  type="submit"
                >
                  {snapshot.mutations.sendMessagePending ? "Sending…" : "Send message"}
                </button>
                {activeTurnId ? (
                  <button
                    className="secondary-button"
                    disabled={snapshot.mutations.interruptPending}
                    onClick={() => {
                      void handleInterrupt();
                    }}
                    type="button"
                  >
                    {snapshot.mutations.interruptPending ? "Interrupting…" : "Interrupt turn"}
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
          {snapshot.detail.kind === "idle" ? (
            <p className="status-line">Select a thread to read full history from the bridge.</p>
          ) : null}
          {snapshot.detail.kind === "loading" ? (
            <p className="status-line">Loading thread detail…</p>
          ) : null}
          {snapshot.detail.kind === "error" ? (
            <p className="status-line error">{snapshot.detail.message}</p>
          ) : null}
          {snapshot.detail.kind === "ready" ? <ThreadDetailPanel thread={snapshot.detail.thread} /> : null}
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
        <p className="status-line">No turns yet. Send the first message to materialize this thread.</p>
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
