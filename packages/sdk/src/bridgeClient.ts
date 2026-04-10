import type {
  ApiErrorPayload,
  BridgeEvent,
  RequestRespondRequest,
  RequestRespondResponse,
  ThreadListRequest,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadStartRequest,
  ThreadStartResponse,
  TurnInterruptRequest,
  TurnInterruptResponse,
  TurnStartRequest,
  TurnStartResponse
} from "@my-codex-app/protocol";

export interface BridgeClientConfig {
  baseUrl: string;
  accessToken?: string;
}

type EventFrame = BridgeEvent | { type: "connected" } | { type: "error"; message: string };

export class BridgeClient {
  readonly #baseUrl: string;
  readonly #accessToken: string;

  constructor(config: BridgeClientConfig) {
    this.#baseUrl = config.baseUrl;
    this.#accessToken = config.accessToken ?? "";
  }

  listThreads(request: ThreadListRequest = {}): Promise<ThreadListResponse> {
    return this.#requestJson<ThreadListResponse>("/api/threads", {
      method: "GET"
    }, request.cursor !== undefined || request.limit !== undefined
      ? {
          ...(request.cursor !== undefined ? { cursor: request.cursor } : {}),
          ...(request.limit !== undefined ? { limit: String(request.limit) } : {})
        }
      : undefined);
  }

  readThread(threadId: string): Promise<ThreadReadResponse> {
    return this.#requestJson<ThreadReadResponse>(
      `/api/threads/${encodeURIComponent(threadId)}`,
      { method: "GET" }
    );
  }

  startThread(request: ThreadStartRequest = {}): Promise<ThreadStartResponse> {
    return this.#requestJson<ThreadStartResponse>("/api/threads/start", {
      method: "POST",
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  startTurn(request: TurnStartRequest): Promise<TurnStartResponse> {
    return this.#requestJson<TurnStartResponse>("/api/turns/start", {
      method: "POST",
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  interruptTurn(request: TurnInterruptRequest): Promise<TurnInterruptResponse> {
    return this.#requestJson<TurnInterruptResponse>("/api/turns/interrupt", {
      method: "POST",
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  respondToRequest(request: RequestRespondRequest): Promise<RequestRespondResponse> {
    return this.#requestJson<RequestRespondResponse>("/api/requests/respond", {
      method: "POST",
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  subscribeToThreadEvents(
    threadId: string,
    handlers: {
      onEvent: (event: BridgeEvent) => void;
      onError: (message: string) => void;
    }
  ): () => void {
    const eventSource = new EventSource(
      this.#buildUrl("/api/events", {
        threadId
      })
    );

    eventSource.onmessage = (message) => {
      const payload = JSON.parse(message.data) as EventFrame;
      if (payload.type === "connected") {
        return;
      }

      if (payload.type === "error") {
        handlers.onError(payload.message);
        return;
      }

      handlers.onEvent(payload);
    };

    eventSource.onerror = () => {
      handlers.onError("Bridge event stream disconnected");
    };

    return () => {
      eventSource.close();
    };
  }

  async #requestJson<TResponse>(
    path: string,
    init: RequestInit,
    searchParams?: Record<string, string>
  ): Promise<TResponse> {
    const response = await fetch(this.#buildUrl(path, searchParams), init);
    if (!response.ok) {
      let message = `Bridge request failed with ${response.status}`;
      try {
        const payload = (await response.json()) as ApiErrorPayload;
        message = payload.error.message ?? message;
      } catch {
        // Ignore malformed error payloads.
      }
      throw new Error(message);
    }

    return (await response.json()) as TResponse;
  }

  #buildUrl(path: string, searchParams?: Record<string, string>): string {
    const url = new URL(path, this.#baseUrl);
    if (this.#accessToken) {
      url.searchParams.set("access_token", this.#accessToken);
    }
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }
}
