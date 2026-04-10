import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { once } from "node:events";
import { createInterface } from "node:readline";

interface JsonRpcRequest<TParams> {
  id: number;
  method: string;
  params: TParams;
}

interface JsonRpcSuccess<TResult> {
  id: number;
  result: TResult;
}

interface JsonRpcFailure {
  id: number;
  error: {
    code: number;
    message: string;
  };
}

interface InitializeResult {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

interface InitializeParams {
  clientInfo: {
    name: string;
    title: string;
    version: string;
  };
}

interface AppServerThreadStatus {
  type: "notLoaded" | "idle" | "systemError" | "active";
  activeFlags?: Array<"waitingOnApproval" | "waitingOnUserInput">;
}

interface AppServerThread {
  id: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  modelProvider: string;
  status: AppServerThreadStatus;
  name?: string;
}

interface ThreadListParams {
  limit?: number;
  cursor?: string;
}

interface ThreadListResult {
  data: AppServerThread[];
  nextCursor?: string;
}

interface AppServerTurnError {
  message: string;
  additionalDetails?: string;
}

interface AppServerUserInput {
  type: "text" | "image" | "localImage" | "skill" | "mention";
  text?: string;
  textElements?: unknown[];
  url?: string;
  path?: string;
  name?: string;
}

interface AppServerThreadItem {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface AppServerTurn {
  id: string;
  status: "completed" | "interrupted" | "failed" | "inProgress";
  error?: AppServerTurnError;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  items: AppServerThreadItem[];
}

interface ThreadReadParams {
  threadId: string;
  includeTurns: boolean;
}

interface ThreadReadResult {
  thread: AppServerThread & {
    turns: AppServerTurn[];
  };
}

interface ThreadStartParams {
  cwd?: string;
}

interface ThreadStartResult {
  thread: AppServerThread & {
    turns: AppServerTurn[];
  };
}

interface ThreadResumeParams {
  threadId: string;
}

interface ThreadResumeResult {
  thread: AppServerThread & {
    turns: AppServerTurn[];
  };
}

interface ThreadUnsubscribeParams {
  threadId: string;
}

interface TurnStartParams {
  threadId: string;
  input: AppServerUserInput[];
}

interface TurnStartResult {
  turn: AppServerTurn;
}

interface TurnInterruptParams {
  threadId: string;
  turnId: string;
}

interface NotificationEnvelope {
  method: string;
  params?: unknown;
}

interface RequestEnvelope {
  id: number | string;
  method: string;
  params?: unknown;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class AppServerClient extends EventEmitter {
  #child: ChildProcessWithoutNullStreams;
  #lineReader: ReturnType<typeof createInterface>;
  #nextRequestId = 1;
  #pendingRequests = new Map<number, PendingRequest>();
  #initialized = false;

  constructor(private readonly command = "codex", private readonly args = ["app-server"]) {
    super();
    this.#child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.#lineReader = createInterface({ input: this.#child.stdout });
    this.#lineReader.on("line", (line) => {
      this.#handleLine(line);
    });
    this.#child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8").trim();
      if (text.length > 0) {
        console.error(`[app-server] ${text}`);
      }
    });
    this.#child.on("exit", (code, signal) => {
      const reason = new Error(
        `codex app-server exited before request completed (code=${code ?? "null"} signal=${signal ?? "null"})`
      );
      for (const pending of this.#pendingRequests.values()) {
        pending.reject(reason);
      }
      this.#pendingRequests.clear();
    });
  }

  async initialize(): Promise<InitializeResult> {
    if (this.#initialized) {
      throw new Error("App-server client is already initialized");
    }

    const response = await this.#sendRequest<InitializeParams, InitializeResult>("initialize", {
      clientInfo: {
        name: "my_codex_app_bridge",
        title: "My Codex App Bridge",
        version: "0.1.0"
      }
    });

    this.#write({
      method: "initialized",
      params: {}
    });

    this.#initialized = true;
    return response;
  }

  async listThreads(params: ThreadListParams): Promise<ThreadListResult> {
    if (!this.#initialized) {
      throw new Error("App-server client must be initialized before use");
    }

    return this.#sendRequest<ThreadListParams, ThreadListResult>("thread/list", params);
  }

  async readThread(threadId: string): Promise<ThreadReadResult> {
    if (!this.#initialized) {
      throw new Error("App-server client must be initialized before use");
    }

    return this.#sendRequest<ThreadReadParams, ThreadReadResult>("thread/read", {
      threadId,
      includeTurns: true
    });
  }

  async startThread(params: ThreadStartParams): Promise<ThreadStartResult> {
    if (!this.#initialized) {
      throw new Error("App-server client must be initialized before use");
    }

    return this.#sendRequest<ThreadStartParams, ThreadStartResult>("thread/start", params);
  }

  async resumeThread(threadId: string): Promise<ThreadResumeResult> {
    if (!this.#initialized) {
      throw new Error("App-server client must be initialized before use");
    }

    return this.#sendRequest<ThreadResumeParams, ThreadResumeResult>("thread/resume", {
      threadId
    });
  }

  async unsubscribeThread(threadId: string): Promise<void> {
    if (!this.#initialized) {
      throw new Error("App-server client must be initialized before use");
    }

    await this.#sendRequest<ThreadUnsubscribeParams, unknown>("thread/unsubscribe", {
      threadId
    });
  }

  async startTurn(params: TurnStartParams): Promise<TurnStartResult> {
    if (!this.#initialized) {
      throw new Error("App-server client must be initialized before use");
    }

    return this.#sendRequest<TurnStartParams, TurnStartResult>("turn/start", params);
  }

  async interruptTurn(params: TurnInterruptParams): Promise<void> {
    if (!this.#initialized) {
      throw new Error("App-server client must be initialized before use");
    }

    await this.#sendRequest<TurnInterruptParams, unknown>("turn/interrupt", params);
  }

  sendServerRequestResponse(id: number | string, result: unknown): void {
    this.#write({
      id,
      result
    });
  }

  async close(): Promise<void> {
    this.#child.stdin.end();
    this.#lineReader.close();

    const exitedGracefully = await waitForExit(this.#child, 500);
    if (!exitedGracefully && !this.#child.killed) {
      this.#child.kill("SIGTERM");
      await once(this.#child, "exit");
    }
  }

  #write(payload: Record<string, unknown>): void {
    this.#child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async #sendRequest<TParams, TResult>(method: string, params: TParams): Promise<TResult> {
    const id = this.#nextRequestId++;
    const request: JsonRpcRequest<TParams> = { id, method, params };
    const promise = new Promise<TResult>((resolve, reject) => {
      this.#pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject
      });
    });
    this.#write(request as unknown as Record<string, unknown>);
    return promise;
  }

  #handleLine(line: string): void {
    if (line.trim().length === 0) {
      return;
    }

    const payload = JSON.parse(line) as Partial<JsonRpcSuccess<unknown> & JsonRpcFailure> & {
      method?: string;
    };

    if (payload.method) {
      if ("id" in payload && (typeof payload.id === "number" || typeof payload.id === "string")) {
        this.emit("request", payload as RequestEnvelope);
        return;
      }

      this.emit("notification", payload as NotificationEnvelope);
      return;
    }

    if (typeof payload.id !== "number") {
      return;
    }

    const pending = this.#pendingRequests.get(payload.id);
    if (!pending) {
      return;
    }

    this.#pendingRequests.delete(payload.id);

    if ("error" in payload && payload.error) {
      pending.reject(new Error(payload.error.message));
      return;
    }

    pending.resolve(payload.result);
  }
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onExit = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };

    child.on("exit", onExit);
  });
}
