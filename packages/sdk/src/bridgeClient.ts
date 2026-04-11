import type {
  ApiErrorPayload,
  BridgeEvent,
  DeviceListResponse,
  DeviceRevokeRequest,
  DeviceRevokeResponse,
  DeviceTrustRecord,
  PairingCompleteRequest,
  PairingCompleteResponse,
  PairingStatusResponse,
  RequestRespondRequest,
  RequestRespondResponse,
  SessionRefreshRequest,
  SessionRefreshResponse,
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
  credentialStore?: BridgeCredentialStore;
}

type EventFrame = BridgeEvent | { type: "connected" } | { type: "error"; message: string };

class BridgeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ApiErrorPayload["error"]["code"]
  ) {
    super(message);
  }
}

export interface BridgeSessionCredentials {
  device: DeviceTrustRecord;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
}

export interface BridgeCredentialStore {
  clear(): void;
  load(): BridgeSessionCredentials | null;
  save(credentials: BridgeSessionCredentials): void;
}

export class BridgeClient {
  readonly #baseUrl: string;
  readonly #credentialStore: BridgeCredentialStore | null;
  #refreshPromise: Promise<BridgeSessionCredentials> | null = null;

  constructor(config: BridgeClientConfig) {
    this.#baseUrl = config.baseUrl;
    this.#credentialStore = config.credentialStore ?? null;
  }

  getCredentials(): BridgeSessionCredentials | null {
    return this.#credentialStore?.load() ?? null;
  }

  hasCredentials(): boolean {
    return this.getCredentials() !== null;
  }

  clearCredentials(): void {
    this.#credentialStore?.clear();
  }

  getPairingStatus(): Promise<PairingStatusResponse> {
    return this.#requestJson<PairingStatusResponse>("/api/pairing", { method: "GET" }, undefined, {
      requiresAuth: false
    });
  }

  async completePairing(request: PairingCompleteRequest): Promise<PairingCompleteResponse> {
    const response = await this.#requestJson<PairingCompleteResponse>(
      "/api/pairing/complete",
      {
        method: "POST",
        body: JSON.stringify(request),
        headers: {
          "Content-Type": "application/json"
        }
      },
      undefined,
      {
        requiresAuth: false
      }
    );
    this.#storeSession(response.device, response.session);
    return response;
  }

  async refreshSession(): Promise<SessionRefreshResponse> {
    const credentials = await this.#refreshCredentials();
    return this.#toSessionRefreshResponse(credentials);
  }

  listDevices(): Promise<DeviceListResponse> {
    return this.#requestJson<DeviceListResponse>("/api/devices", { method: "GET" });
  }

  revokeDevice(request: DeviceRevokeRequest): Promise<DeviceRevokeResponse> {
    return this.#requestJson<DeviceRevokeResponse>("/api/devices/revoke", {
      method: "POST",
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json"
      }
    });
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
    let closed = false;
    let eventSource: EventSource | null = null;
    let reconnectAttempt = 0;

    const connect = async (): Promise<void> => {
      const credentials = await this.#getValidCredentials();
      if (!credentials || closed) {
        handlers.onError("Bridge session is unavailable");
        return;
      }

      eventSource = new EventSource(
        this.#buildUrl(
          "/api/events",
          {
            threadId,
            access_token: credentials.accessToken
          },
          false
        )
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

      eventSource.onopen = () => {
        reconnectAttempt = 0;
      };

      eventSource.onerror = () => {
        if (closed) {
          return;
        }

        eventSource?.close();
        eventSource = null;
        reconnectAttempt++;
        const delay = Math.min(1000 * 2 ** (reconnectAttempt - 1), 30_000) + Math.floor(Math.random() * 1000);
        setTimeout(() => {
          void this.#refreshCredentials()
            .then(() => {
              if (!closed) {
                void connect();
              }
            })
            .catch(() => {
              handlers.onError("Bridge event stream disconnected");
            });
        }, delay);
      };
    };

    void connect();

    return () => {
      closed = true;
      eventSource?.close();
    };
  }

  async #requestJson<TResponse>(
    path: string,
    init: RequestInit,
    searchParams?: Record<string, string>,
    options?: {
      requiresAuth?: boolean;
      retryOnAuthFailure?: boolean;
    }
  ): Promise<TResponse> {
    const requiresAuth = options?.requiresAuth ?? true;
    const retryOnAuthFailure = options?.retryOnAuthFailure ?? true;
    const credentials = requiresAuth ? await this.#getValidCredentials() : null;
    const response = await fetch(this.#buildUrl(path, searchParams, false), {
      ...init,
      headers: {
        ...(init.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {}),
        ...(credentials ? { Authorization: `Bearer ${credentials.accessToken}` } : {})
      }
    });
    if (response.status === 401 && requiresAuth && retryOnAuthFailure) {
      await this.#refreshCredentials();
      return this.#requestJson<TResponse>(path, init, searchParams, {
        requiresAuth,
        retryOnAuthFailure: false
      });
    }

    if (!response.ok) {
      let message = `Bridge request failed with ${response.status}`;
      let code: ApiErrorPayload["error"]["code"] | undefined;
      try {
        const payload = (await response.json()) as ApiErrorPayload;
        message = payload.error.message ?? message;
        code = payload.error.code;
      } catch {
        // Ignore malformed error payloads.
      }
      throw new BridgeRequestError(message, response.status, code);
    }

    return (await response.json()) as TResponse;
  }

  async #getValidCredentials(): Promise<BridgeSessionCredentials | null> {
    const credentials = this.getCredentials();
    if (!credentials) {
      return null;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (credentials.accessTokenExpiresAt > nowInSeconds + 15) {
      return credentials;
    }

    await this.#refreshCredentials();
    return this.getCredentials();
  }

  #refreshCredentials(): Promise<BridgeSessionCredentials> {
    if (this.#refreshPromise) {
      return this.#refreshPromise;
    }

    const startingCredentials = this.getCredentials();
    if (!startingCredentials) {
      return Promise.reject(new Error("Bridge session is unavailable"));
    }

    this.#refreshPromise = this.#performRefresh(startingCredentials)
      .catch((error) => {
        const recovered = this.#recoverConcurrentCredentials(startingCredentials.refreshToken);
        if (recovered) {
          return recovered;
        }

        if (isCredentialInvalidatingRefreshError(error)) {
          this.clearCredentials();
        }
        throw error;
      })
      .finally(() => {
        this.#refreshPromise = null;
      });

    return this.#refreshPromise;
  }

  async #performRefresh(credentials: BridgeSessionCredentials): Promise<BridgeSessionCredentials> {
    const response = await this.#requestJson<SessionRefreshResponse>(
      "/api/session/refresh",
      {
        method: "POST",
        body: JSON.stringify({
          deviceId: credentials.device.deviceId,
          refreshToken: credentials.refreshToken
        } satisfies SessionRefreshRequest),
        headers: {
          "Content-Type": "application/json"
        }
      },
      undefined,
      {
        requiresAuth: false,
        retryOnAuthFailure: false
      }
    );
    const nextCredentials = this.#toStoredCredentials(response.device, response.session);
    this.#credentialStore?.save(nextCredentials);
    return nextCredentials;
  }

  #recoverConcurrentCredentials(refreshTokenUsedForAttempt: string): BridgeSessionCredentials | null {
    const latestCredentials = this.getCredentials();
    if (!latestCredentials) {
      return null;
    }

    return latestCredentials.refreshToken !== refreshTokenUsedForAttempt ? latestCredentials : null;
  }

  #storeSession(
    device: DeviceTrustRecord,
    session: {
      accessToken: string;
      accessTokenExpiresAt: number;
      refreshToken: string;
    }
  ): void {
    this.#credentialStore?.save(this.#toStoredCredentials(device, session));
  }

  #toStoredCredentials(
    device: DeviceTrustRecord,
    session: {
      accessToken: string;
      accessTokenExpiresAt: number;
      refreshToken: string;
    }
  ): BridgeSessionCredentials {
    return {
      device,
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshToken: session.refreshToken
    };
  }

  #toSessionRefreshResponse(credentials: BridgeSessionCredentials): SessionRefreshResponse {
    return {
      device: credentials.device,
      session: {
        accessToken: credentials.accessToken,
        accessTokenExpiresAt: credentials.accessTokenExpiresAt,
        refreshToken: credentials.refreshToken
      }
    };
  }

  #buildUrl(
    path: string,
    searchParams?: Record<string, string>,
    includeAccessToken = true
  ): string {
    const url = new URL(path, this.#baseUrl);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        url.searchParams.set(key, value);
      }
    }
    if (includeAccessToken) {
      const credentials = this.getCredentials();
      if (credentials?.accessToken) {
        url.searchParams.set("access_token", credentials.accessToken);
      }
    }
    return url.toString();
  }
}

function isCredentialInvalidatingRefreshError(error: unknown): boolean {
  return (
    error instanceof BridgeRequestError &&
    (error.code === "invalidRefreshToken" ||
      error.code === "expiredRefreshToken" ||
      error.code === "revokedDevice" ||
      error.code === "missingCredentials")
  );
}
