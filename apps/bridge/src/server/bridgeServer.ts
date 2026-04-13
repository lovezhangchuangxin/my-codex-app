import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type {
  DeviceDeleteRequest,
  DeviceRevokeRequest,
  ModelListRequest,
  PairingCompleteRequest,
  PairingStatusResponse,
  ProjectImportRequest,
  ProjectSearchRequest,
  RequestRespondRequest,
  SessionRefreshRequest,
  ThreadCompactRequest,
  ThreadListRequest,
  ThreadReviewRequest,
  ThreadStartRequest,
  TurnInterruptRequest,
  TurnStartRequest,
  WorkspaceReadDirectoryRequest,
  WorkspaceReadFileRequest,
  WorkspaceSearchFilesRequest
} from "@my-codex-app/protocol";

import { authenticateBridgeRequest } from "../auth/authenticate";
import { BridgeAuthService } from "../auth/authService";
import { ProjectService } from "../projectService";
import { ThreadService } from "../threadService";
import { WorkspaceService } from "../workspaceService";
import type { BridgeServerConfig } from "./config";
import {
  classifyAppServerError,
  isRecord,
  parseOptionalInt,
  readJsonBody,
  writeError,
  writeJson
} from "./http";
import { logPairingStatus } from "./logging";
import { ThreadEventStreamRegistry } from "./threadEventStreamRegistry";

class RateLimiter {
  readonly #entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.#entries.get(key);
    if (!entry || now >= entry.resetAt) {
      this.#entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.max;
  }
}

export interface BridgeServerServices {
  authService: BridgeAuthService;
  projectService: ProjectService;
  threadService: ThreadService;
  workspaceService: WorkspaceService;
  eventRegistry: ThreadEventStreamRegistry;
}

export class BridgeServer {
  readonly #pairingLimiter = new RateLimiter(10, 60_000);
  readonly #refreshLimiter = new RateLimiter(30, 60_000);
  readonly #server = createServer((request, response) => {
    void this.#handleRequest(request, response);
  });

  constructor(
    private readonly config: BridgeServerConfig,
    private readonly services: BridgeServerServices
  ) {}

  listen(onListening: () => void): void {
    this.#server.listen(this.config.port, this.config.host, onListening);
  }

  async close(): Promise<void> {
    this.services.eventRegistry.close();
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.#setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (!request.url) {
      writeJson(response, 400, { error: { message: "Missing request URL" } });
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
    if (await this.#handlePublicRoutes(request, response, url)) {
      return;
    }

    try {
      authenticateBridgeRequest(request, url, this.services.authService, {
        allowQueryToken: request.method === "GET" && url.pathname === "/api/events"
      });
    } catch (error) {
      writeError(response, error, 401);
      return;
    }

    if (await this.#handleProtectedRoutes(request, response, url)) {
      return;
    }

    writeJson(response, 404, { error: { message: "Route not found" } });
  }

  async #handlePublicRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/healthz") {
      writeJson(response, 200, { status: "ok" });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/pairing") {
      try {
        const status = this.services.authService.getPairingStatus();
        if (status.regenerated) {
          logPairingStatus(status);
        }
        const payload: PairingStatusResponse = {
          pairingRequired: status.pairingRequired,
          instructions: status.instructions,
          expiresAt: status.expiresAt
        };
        writeJson(response, 200, payload);
      } catch (error) {
        writeError(response, error, 500);
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/pairing/complete") {
      if (!this.#pairingLimiter.check(request.socket.remoteAddress ?? "unknown")) {
        writeJson(response, 429, { error: { message: "Too many requests" } });
        return true;
      }
      try {
        const payload = await readJsonBody<PairingCompleteRequest>(request);
        if (!isRecord(payload) || !isRecord(payload.device) || typeof payload.code !== "string") {
          writeJson(response, 400, { error: { message: "Invalid pairing payload" } });
          return true;
        }

        const result = this.services.authService.completePairing(payload);
        logPairingStatus(this.services.authService.getPairingStatus());
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 400);
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/session/refresh") {
      if (!this.#refreshLimiter.check(request.socket.remoteAddress ?? "unknown")) {
        writeJson(response, 429, { error: { message: "Too many requests" } });
        return true;
      }
      try {
        const payload = await readJsonBody<SessionRefreshRequest>(request);
        if (
          !isRecord(payload) ||
          typeof payload.deviceId !== "string" ||
          typeof payload.refreshToken !== "string"
        ) {
          writeJson(response, 400, { error: { message: "Invalid session/refresh payload" } });
          return true;
        }

        const result = this.services.authService.refreshSession(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 401);
      }
      return true;
    }

    return false;
  }

  async #handleProtectedRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (await this.#handleDeviceRoutes(request, response, url)) {
      return true;
    }

    if (await this.#handleProjectRoutes(request, response, url)) {
      return true;
    }

    if (await this.#handleWorkspaceRoutes(request, response, url)) {
      return true;
    }

    if (await this.#handleThreadRoutes(request, response, url)) {
      return true;
    }

    if (await this.#handleTurnRoutes(request, response, url)) {
      return true;
    }

    if (await this.#handleEventRoute(request, response, url)) {
      return true;
    }

    return false;
  }

  async #handleDeviceRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/api/devices") {
      try {
        const result = this.services.authService.listDevices();
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 500);
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/devices/revoke") {
      try {
        const payload = await readJsonBody<DeviceRevokeRequest>(request);
        if (!isRecord(payload) || typeof payload.deviceId !== "string") {
          writeJson(response, 400, { error: { message: "Invalid device/revoke payload" } });
          return true;
        }

        const result = this.services.authService.revokeDevice(payload.deviceId);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 404);
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/devices/delete") {
      try {
        const payload = await readJsonBody<DeviceDeleteRequest>(request);
        if (!isRecord(payload) || typeof payload.deviceId !== "string") {
          writeJson(response, 400, { error: { message: "Invalid device/delete payload" } });
          return true;
        }

        const result = this.services.authService.deleteDevice(payload.deviceId);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 404);
      }
      return true;
    }

    return false;
  }

  async #handleWorkspaceRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/api/workspace/directory") {
      try {
        const threadId = url.searchParams.get("threadId") ?? "";
        const path = url.searchParams.get("path") ?? undefined;
        if (threadId.length === 0) {
          writeJson(response, 400, { error: { message: "Missing threadId" } });
          return true;
        }

        const payload: WorkspaceReadDirectoryRequest = {
          threadId,
          ...(path !== undefined ? { path } : {})
        };
        const result = await this.services.workspaceService.readDirectory(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/workspace/file") {
      try {
        const threadId = url.searchParams.get("threadId") ?? "";
        const path = url.searchParams.get("path") ?? "";
        if (threadId.length === 0 || path.length === 0) {
          writeJson(response, 400, { error: { message: "Missing threadId or path" } });
          return true;
        }

        const payload: WorkspaceReadFileRequest = {
          threadId,
          path
        };
        const result = await this.services.workspaceService.readFile(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/workspace/search") {
      try {
        const threadId = url.searchParams.get("threadId") ?? "";
        const query = url.searchParams.get("query") ?? "";
        const limit = parseOptionalInt(url.searchParams.get("limit"));
        if (threadId.length === 0) {
          writeJson(response, 400, { error: { message: "Missing threadId" } });
          return true;
        }

        const payload: WorkspaceSearchFilesRequest = {
          threadId,
          query,
          ...(limit !== undefined ? { limit } : {})
        };
        const result = await this.services.workspaceService.searchFiles(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    return false;
  }

  async #handleProjectRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/api/projects") {
      try {
        const result = await this.services.projectService.listProjects();
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/projects/search") {
      try {
        const limit = parseOptionalInt(url.searchParams.get("limit"));
        const payload: ProjectSearchRequest = {
          query: url.searchParams.get("query") ?? "",
          ...(limit !== undefined ? { limit } : {})
        };
        const result = await this.services.projectService.searchProjects(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/projects/import") {
      try {
        const payload = await readJsonBody<ProjectImportRequest>(request);
        if (!isRecord(payload) || typeof payload.path !== "string") {
          writeJson(response, 400, { error: { message: "Invalid project/import payload" } });
          return true;
        }

        const result = await this.services.projectService.importProject(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    return false;
  }

  async #handleThreadRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/api/threads") {
      try {
        const cursor = url.searchParams.get("cursor") ?? undefined;
        const limit = parseOptionalInt(url.searchParams.get("limit"));
        const cwd = url.searchParams.get("cwd") ?? undefined;
        const payload: ThreadListRequest = {
          ...(cursor ? { cursor } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(cwd ? { cwd } : {})
        };
        const result = await this.services.threadService.listThreads(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 502);
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/models") {
      try {
        const includeHidden = url.searchParams.get("includeHidden");
        const payload: ModelListRequest = {
          ...(includeHidden !== null ? { includeHidden: includeHidden === "true" } : {})
        };
        const result = await this.services.threadService.listModels(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/threads/")) {
      try {
        const threadId = decodeURIComponent(url.pathname.replace("/api/threads/", ""));
        if (threadId.length === 0) {
          writeJson(response, 400, { error: { message: "Missing thread id" } });
          return true;
        }
        const result = await this.services.threadService.readThread(threadId);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/threads/start") {
      try {
        const payload = await readJsonBody<ThreadStartRequest>(request);
        const result = await this.services.threadService.startThread(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/threads/compact") {
      try {
        const payload = await readJsonBody<ThreadCompactRequest>(request);
        if (!isRecord(payload) || typeof payload.threadId !== "string") {
          writeJson(response, 400, { error: { message: "Invalid thread/compact payload" } });
          return true;
        }

        const result = await this.services.threadService.compactThread(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    return false;
  }

  async #handleTurnRoutes(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (request.method === "POST" && url.pathname === "/api/turns/start") {
      try {
        const payload = await readJsonBody<TurnStartRequest>(request);
        if (!payload.threadId || !Array.isArray(payload.input)) {
          writeJson(response, 400, { error: { message: "Invalid turn/start payload" } });
          return true;
        }

        const result = await this.services.threadService.startTurn(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/turns/interrupt") {
      try {
        const payload = await readJsonBody<TurnInterruptRequest>(request);
        if (!payload.threadId || !payload.turnId) {
          writeJson(response, 400, { error: { message: "Invalid turn/interrupt payload" } });
          return true;
        }

        const result = await this.services.threadService.interruptTurn(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/reviews/start") {
      try {
        const payload = await readJsonBody<ThreadReviewRequest>(request);
        if (
          !isRecord(payload) ||
          typeof payload.threadId !== "string" ||
          !isValidReviewTarget(payload.target)
        ) {
          writeJson(response, 400, { error: { message: "Invalid review/start payload" } });
          return true;
        }

        const result = await this.services.threadService.startReview(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/requests/respond") {
      try {
        const payload = await readJsonBody<RequestRespondRequest>(request);
        if (!isRecord(payload) || !("requestId" in payload) || !("response" in payload)) {
          writeJson(response, 400, { error: { message: "Invalid request/respond payload" } });
          return true;
        }

        const result = await this.services.threadService.respondToRequest(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return true;
    }

    return false;
  }

  async #handleEventRoute(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (!(request.method === "GET" && url.pathname === "/api/events")) {
      return false;
    }

    const threadId = url.searchParams.get("threadId");
    if (!threadId) {
      writeJson(response, 400, { error: { message: "Missing threadId for event stream" } });
      return true;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": this.config.bridgeOrigin
    });
    response.flushHeaders();
    response.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    try {
      const client = await this.services.eventRegistry.addClient(response, threadId);
      request.on("close", () => {
        this.services.eventRegistry.removeClient(client);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown bridge error";
      response.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      response.end();
    }

    return true;
  }

  #setCorsHeaders(response: ServerResponse): void {
    response.setHeader("Access-Control-Allow-Origin", this.config.bridgeOrigin);
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  }
}

function isValidReviewTarget(value: unknown): value is ThreadReviewRequest["target"] {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "uncommittedChanges":
      return true;
    case "baseBranch":
      return typeof value.branch === "string" && value.branch.trim().length > 0;
    case "commit":
      return (
        typeof value.sha === "string" &&
        value.sha.trim().length > 0 &&
        (value.title === undefined || typeof value.title === "string")
      );
    case "custom":
      return typeof value.instructions === "string" && value.instructions.trim().length > 0;
    default:
      return false;
  }
}
