import type {
  ApiErrorPayload,
  BridgeEvent,
  BridgeAuthErrorCode,
  DeviceDeleteRequest,
  DeviceDeleteResponse,
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
  TurnStartResponse,
  WorkspaceReadDirectoryRequest,
  WorkspaceReadDirectoryResponse,
  WorkspaceReadFileRequest,
  WorkspaceReadFileResponse
} from "@my-codex-app/protocol";

export interface BridgeClientConfig {
  baseUrl: string;
  credentialStore?: BridgeCredentialStore;
}

type EventFrame = BridgeEvent | { type: "connected" } | { type: "error"; message: string };

export type BridgeClientErrorKind = "http" | "network" | "sessionUnavailable" | "stream";

export class BridgeClientError extends Error {
  readonly kind: BridgeClientErrorKind;
  readonly status: number | undefined;
  readonly code: ApiErrorPayload["error"]["code"] | undefined;

  constructor(
    message: string,
    options: {
      kind: BridgeClientErrorKind;
      status?: number;
      code?: ApiErrorPayload["error"]["code"];
    }
  ) {
    super(message);
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
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

export type BridgeSessionEvent =
  | { type: "refreshing" }
  | { type: "refreshed"; credentials: BridgeSessionCredentials }
  | {
      type: "invalidated";
      code?: BridgeAuthErrorCode;
      message: string;
    };

export class BridgeClient {
  readonly #baseUrl: string;
  readonly #credentialStore: BridgeCredentialStore | null;
  readonly #sessionListeners = new Set<(event: BridgeSessionEvent) => void>();
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

  subscribeToSessionEvents(listener: (event: BridgeSessionEvent) => void): () => void {
    this.#sessionListeners.add(listener);
    return () => {
      this.#sessionListeners.delete(listener);
    };
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

  deleteDevice(request: DeviceDeleteRequest): Promise<DeviceDeleteResponse> {
    return this.#requestJson<DeviceDeleteResponse>("/api/devices/delete", {
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

  readWorkspaceDirectory(
    request: WorkspaceReadDirectoryRequest
  ): Promise<WorkspaceReadDirectoryResponse> {
    return this.#requestJson<WorkspaceReadDirectoryResponse>(
      "/api/workspace/directory",
      {
        method: "GET"
      },
      {
        threadId: request.threadId,
        ...(request.path !== undefined ? { path: request.path } : {})
      }
    );
  }

  readWorkspaceFile(request: WorkspaceReadFileRequest): Promise<WorkspaceReadFileResponse> {
    return this.#requestJson<WorkspaceReadFileResponse>(
      "/api/workspace/file",
      {
        method: "GET"
      },
      {
        threadId: request.threadId,
        path: request.path
      }
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
      onDisconnect: (error: BridgeClientError) => void;
    }
  ): () => void {
    let closed = false;
    let eventSource: EventSource | null = null;

    const connect = async (): Promise<void> => {
      let credentials: BridgeSessionCredentials | null = null;
      try {
        credentials = await this.#getValidCredentials();
      } catch (error) {
        if (!closed) {
          handlers.onDisconnect(toBridgeClientError(error, "Bridge session is unavailable"));
        }
        return;
      }

      if (!credentials || closed) {
        handlers.onDisconnect(
          new BridgeClientError("Bridge session is unavailable", {
            kind: "sessionUnavailable",
            code: "missingCredentials"
          })
        );
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
        let payload: EventFrame;
        try {
          payload = JSON.parse(message.data) as EventFrame;
        } catch {
          eventSource?.close();
          eventSource = null;
          if (!closed) {
            handlers.onDisconnect(
              new BridgeClientError("Bridge event stream returned invalid data", {
                kind: "stream"
              })
            );
          }
          return;
        }

        if (payload.type === "connected") {
          return;
        }

        if (payload.type === "error") {
          eventSource?.close();
          eventSource = null;
          handlers.onDisconnect(
            new BridgeClientError(payload.message, {
              kind: "stream"
            })
          );
          return;
        }

        handlers.onEvent(payload);
      };

      eventSource.onerror = () => {
        if (closed) {
          return;
        }

        eventSource?.close();
        eventSource = null;
        handlers.onDisconnect(
          new BridgeClientError("Bridge event stream disconnected", {
            kind: "network"
          })
        );
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
    let response: Response;
    try {
      response = await fetch(this.#buildUrl(path, searchParams, false), {
        ...init,
        headers: {
          ...(init.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {}),
          ...(credentials ? { Authorization: `Bearer ${credentials.accessToken}` } : {})
        }
      });
    } catch (error) {
      throw toBridgeClientError(error, "Bridge request failed before receiving a response");
    }

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
      throw new BridgeClientError(message, {
        kind: "http",
        status: response.status,
        ...(code ? { code } : {})
      });
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
      return Promise.reject(
        new BridgeClientError("Bridge session is unavailable", {
          kind: "sessionUnavailable",
          code: "missingCredentials"
        })
      );
    }

    this.#emitSessionEvent({ type: "refreshing" });
    this.#refreshPromise = this.#performRefresh(startingCredentials)
      .then((credentials) => {
        this.#emitSessionEvent({ type: "refreshed", credentials });
        return credentials;
      })
      .catch((error) => {
        const recovered = this.#recoverConcurrentCredentials(startingCredentials.refreshToken);
        if (recovered) {
          return recovered;
        }

        if (isCredentialInvalidatingRefreshError(error)) {
          const nextError = toBridgeClientError(error, "Bridge session is no longer valid");
          this.clearCredentials();
          this.#emitSessionEvent({
            type: "invalidated",
            message: nextError.message,
            ...(nextError.code ? { code: nextError.code } : {})
          });
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

  #emitSessionEvent(event: BridgeSessionEvent): void {
    for (const listener of this.#sessionListeners) {
      listener(event);
    }
  }
}

function isCredentialInvalidatingRefreshError(error: unknown): boolean {
  return (
    error instanceof BridgeClientError &&
    (error.code === "invalidRefreshToken" ||
      error.code === "expiredRefreshToken" ||
      error.code === "revokedDevice" ||
      error.code === "missingCredentials")
  );
}

function toBridgeClientError(error: unknown, fallbackMessage: string): BridgeClientError {
  if (error instanceof BridgeClientError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return new BridgeClientError(message || fallbackMessage, {
    kind: "network"
  });
}
