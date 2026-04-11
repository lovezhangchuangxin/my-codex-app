import { createServer } from "node:http";
import { join } from "node:path";

import type {
  ApiErrorPayload,
  DeviceListResponse,
  DeviceRevokeRequest,
  PairingCompleteRequest,
  PairingStatusResponse,
  RequestRespondRequest,
  SessionRefreshRequest,
  ThreadListRequest,
  ThreadStartRequest,
  TurnInterruptRequest,
  TurnStartRequest
} from "@my-codex-app/protocol";

import { AppServerClient } from "./appServerClient";
import { authenticateBridgeRequest } from "./auth/authenticate";
import { BridgeAuthError, BridgeAuthService } from "./auth/authService";
import { DeviceTrustStore } from "./auth/deviceTrustStore";
import { ThreadService } from "./threadService";

class RateLimiter {
  readonly #entries = new Map<string, { count: number; resetAt: number }>();
  readonly #max: number;
  readonly #windowMs: number;

  constructor(max: number, windowMs: number) {
    this.#max = max;
    this.#windowMs = windowMs;
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.#entries.get(key);
    if (!entry || now >= entry.resetAt) {
      this.#entries.set(key, { count: 1, resetAt: now + this.#windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.#max;
  }
}

const pairingLimiter = new RateLimiter(10, 60_000);
const refreshLimiter = new RateLimiter(30, 60_000);

const port = Number.parseInt(process.env.BRIDGE_PORT ?? "8787", 10);
// 监听 0.0.0.0 允许局域网设备访问（手机等），仅本机访问时可设 BRIDGE_HOST=127.0.0.1
const host = process.env.BRIDGE_HOST ?? "0.0.0.0";
const bridgeOrigin = process.env.BRIDGE_ORIGIN ?? "*";
const threadUnsubscribeGraceMs = Number.parseInt(
  process.env.BRIDGE_THREAD_UNSUBSCRIBE_GRACE_MS ?? "5000",
  10
);
const bridgeStatePath =
  process.env.BRIDGE_STATE_PATH ?? join(process.cwd(), ".local", "bridge-auth-state.json");

type EventClient = {
  response: import("node:http").ServerResponse;
  threadId: string;
};

async function main(): Promise<void> {
  const appServerClient = new AppServerClient();
  await appServerClient.initialize();
  const authService = new BridgeAuthService(new DeviceTrustStore(bridgeStatePath));
  const threadService = new ThreadService(appServerClient);
  const eventClients = new Set<EventClient>();
  const threadSubscriberCounts = new Map<string, number>();
  const threadUnsubscribeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const unsubscribeEvents = threadService.onBridgeEvent((event) => {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of eventClients) {
      if (client.threadId === event.threadId) {
        client.response.write(frame);
      }
    }
  });

  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", bridgeOrigin);
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");

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

    if (request.method === "GET" && url.pathname === "/healthz") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/pairing") {
      try {
        const status = authService.getPairingStatus();
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
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/pairing/complete") {
      if (!pairingLimiter.check(request.socket.remoteAddress ?? "unknown")) {
        writeJson(response, 429, { error: { message: "Too many requests" } });
        return;
      }
      try {
        const payload = await readJsonBody<PairingCompleteRequest>(request);
        if (!isRecord(payload) || !isRecord(payload.device) || typeof payload.code !== "string") {
          writeJson(response, 400, { error: { message: "Invalid pairing payload" } });
          return;
        }

        const result = authService.completePairing(payload);
        logPairingStatus(authService.getPairingStatus());
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 400);
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/session/refresh") {
      if (!refreshLimiter.check(request.socket.remoteAddress ?? "unknown")) {
        writeJson(response, 429, { error: { message: "Too many requests" } });
        return;
      }
      try {
        const payload = await readJsonBody<SessionRefreshRequest>(request);
        if (
          !isRecord(payload) ||
          typeof payload.deviceId !== "string" ||
          typeof payload.refreshToken !== "string"
        ) {
          writeJson(response, 400, { error: { message: "Invalid session/refresh payload" } });
          return;
        }

        const result = authService.refreshSession(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 401);
      }
      return;
    }

    try {
      authenticateBridgeRequest(request, url, authService, {
        allowQueryToken: request.method === "GET" && url.pathname === "/api/events"
      });
    } catch (error) {
      writeError(response, error, 401);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/threads") {
      try {
        const cursor = url.searchParams.get("cursor") ?? undefined;
        const limit = parseOptionalInt(url.searchParams.get("limit"));
        const payload: ThreadListRequest = {
          ...(cursor ? { cursor } : {}),
          ...(limit !== undefined ? { limit } : {})
        };
        const result = await threadService.listThreads(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 502);
      }
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/threads/")) {
      try {
        const threadId = decodeURIComponent(url.pathname.replace("/api/threads/", ""));
        if (threadId.length === 0) {
          writeJson(response, 400, { error: { message: "Missing thread id" } });
          return;
        }
        const result = await threadService.readThread(threadId);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/devices") {
      try {
        const result: DeviceListResponse = authService.listDevices();
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 500);
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/devices/revoke") {
      try {
        const payload = await readJsonBody<DeviceRevokeRequest>(request);
        if (!isRecord(payload) || typeof payload.deviceId !== "string") {
          writeJson(response, 400, { error: { message: "Invalid device/revoke payload" } });
          return;
        }

        const result = authService.revokeDevice(payload.deviceId);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, 404);
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      const threadId = url.searchParams.get("threadId");
      if (!threadId) {
        writeJson(response, 400, { error: { message: "Missing threadId for event stream" } });
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": bridgeOrigin
      });
      response.flushHeaders();
      response.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
      const client = { response, threadId };
      eventClients.add(client);

      try {
        const subscriberCount = threadSubscriberCounts.get(threadId) ?? 0;
        const hadPendingUnsubscribe = cancelScheduledThreadUnsubscribe(
          threadId,
          threadUnsubscribeTimers
        );
        threadSubscriberCounts.set(threadId, subscriberCount + 1);
        if (subscriberCount === 0 && !hadPendingUnsubscribe) {
          await threadService.resumeThread(threadId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown bridge error";
        response.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      }

      request.on("close", async () => {
        eventClients.delete(client);
        const currentCount = threadSubscriberCounts.get(threadId) ?? 0;
        if (currentCount <= 1) {
          threadSubscriberCounts.set(threadId, 0);
          scheduleThreadUnsubscribe(
            threadId,
            threadUnsubscribeGraceMs,
            threadSubscriberCounts,
            threadUnsubscribeTimers,
            threadService
          );
          return;
        }

        threadSubscriberCounts.set(threadId, currentCount - 1);
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/threads/start") {
      try {
        const payload = await readJsonBody<ThreadStartRequest>(request);
        const result = await threadService.startThread(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/turns/start") {
      try {
        const payload = await readJsonBody<TurnStartRequest>(request);
        if (!payload.threadId || !Array.isArray(payload.input)) {
          writeJson(response, 400, { error: { message: "Invalid turn/start payload" } });
          return;
        }

        const result = await threadService.startTurn(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/turns/interrupt") {
      try {
        const payload = await readJsonBody<TurnInterruptRequest>(request);
        if (!payload.threadId || !payload.turnId) {
          writeJson(response, 400, { error: { message: "Invalid turn/interrupt payload" } });
          return;
        }

        const result = await threadService.interruptTurn(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/requests/respond") {
      try {
        const payload = await readJsonBody<RequestRespondRequest>(request);
        if (!isRecord(payload) || !("requestId" in payload) || !("response" in payload)) {
          writeJson(response, 400, { error: { message: "Invalid request/respond payload" } });
          return;
        }

        const result = await threadService.respondToRequest(payload);
        writeJson(response, 200, result);
      } catch (error) {
        writeError(response, error, classifyAppServerError(error, 502));
      }
      return;
    }

    writeJson(response, 404, { error: { message: "Route not found" } });
  });

  const shutdown = async (): Promise<void> => {
    unsubscribeEvents();
    for (const timer of threadUnsubscribeTimers.values()) {
      clearTimeout(timer);
    }
    threadUnsubscribeTimers.clear();
    server.close();
    await appServerClient.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logPairingStatus(authService.getPairingStatus());
  server.listen(port, host, () => {
    console.log(`Bridge listening on http://${host}:${port}`);
    console.log(`Bridge auth state path: ${bridgeStatePath}`);
  });
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cancelScheduledThreadUnsubscribe(
  threadId: string,
  threadUnsubscribeTimers: Map<string, ReturnType<typeof setTimeout>>
): boolean {
  const timer = threadUnsubscribeTimers.get(threadId);
  if (!timer) {
    return false;
  }

  clearTimeout(timer);
  threadUnsubscribeTimers.delete(threadId);
  return true;
}

function scheduleThreadUnsubscribe(
  threadId: string,
  graceMs: number,
  threadSubscriberCounts: Map<string, number>,
  threadUnsubscribeTimers: Map<string, ReturnType<typeof setTimeout>>,
  threadService: ThreadService
): void {
  cancelScheduledThreadUnsubscribe(threadId, threadUnsubscribeTimers);
  const timer = setTimeout(() => {
    threadUnsubscribeTimers.delete(threadId);
    if ((threadSubscriberCounts.get(threadId) ?? 0) > 0) {
      return;
    }

    threadSubscriberCounts.delete(threadId);
    void threadService.unsubscribeThread(threadId).catch(() => {
      // Ignore delayed cleanup errors; the bridge remains authoritative on reconnect.
    });
  }, Math.max(graceMs, 0));
  threadUnsubscribeTimers.set(threadId, timer);
}

function writeJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function writeError(
  response: import("node:http").ServerResponse,
  error: unknown,
  statusCode: number
): void {
  if (error instanceof BridgeAuthError) {
    writeJson(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message
      }
    } satisfies ApiErrorPayload);
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown bridge error";
  console.error(`[bridge] Unhandled error (${statusCode}): ${message}`);
  writeJson(response, statusCode, { error: { message } } satisfies ApiErrorPayload);
}

async function readJsonBody<T>(request: import("node:http").IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function classifyAppServerError(error: unknown, fallbackStatusCode: number): number {
  const message = error instanceof Error ? error.message : "";
  if (message === "Invalid JSON request body") {
    return 400;
  }

  if (
    message.includes("not materialized yet") ||
    message.includes("includeTurns is unavailable before first user message") ||
    message.includes("thread not loaded") ||
    message.includes("active turn") ||
    message.includes("cannot accept same-turn steering") ||
    message.includes("Unknown or resolved pending request")
  ) {
    return 409;
  }

  if (
    message.includes("missing") ||
    message.includes("invalid") ||
    message.includes("failed to parse") ||
    message.includes("unknown thread") ||
    message.includes("unknown turn")
  ) {
    return 400;
  }

  return fallbackStatusCode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function logPairingStatus(status: PairingStatusResponse & { pairingCode: string; regenerated?: boolean }): void {
  if (status.regenerated) {
    console.log("Pairing code rotated.");
  }
  console.log(`Pairing code: ${status.pairingCode} (expires at ${new Date(status.expiresAt * 1000).toISOString()})`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
