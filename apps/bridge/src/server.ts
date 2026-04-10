import { createServer } from "node:http";

import type {
  ApiErrorPayload,
  ThreadListRequest,
  ThreadStartRequest,
  TurnInterruptRequest,
  TurnStartRequest
} from "@my-codex-app/protocol";

import { AppServerClient } from "./appServerClient.js";
import { ThreadService } from "./threadService.js";

const port = Number.parseInt(process.env.BRIDGE_PORT ?? "8787", 10);
const host = process.env.BRIDGE_HOST ?? "127.0.0.1";
const bridgeOrigin = process.env.BRIDGE_ORIGIN ?? "*";
const bridgeAccessToken = process.env.BRIDGE_ACCESS_TOKEN;

if (!bridgeAccessToken) {
  throw new Error("BRIDGE_ACCESS_TOKEN is required");
}

type EventClient = {
  response: import("node:http").ServerResponse;
  threadId: string;
};

async function main(): Promise<void> {
  const appServerClient = new AppServerClient();
  await appServerClient.initialize();
  const threadService = new ThreadService(appServerClient);
  const eventClients = new Set<EventClient>();
  const threadSubscriberCounts = new Map<string, number>();
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
    const isAuthorized = hasValidAccessToken(request, url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    if (!isAuthorized) {
      writeJson(response, 401, { error: { message: "Unauthorized bridge request" } });
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
        threadSubscriberCounts.set(threadId, subscriberCount + 1);
        if (subscriberCount === 0) {
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
          threadSubscriberCounts.delete(threadId);
          try {
            await threadService.unsubscribeThread(threadId);
          } catch {
            // Ignore cleanup errors; the bridge remains authoritative on reconnect.
          }
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

    writeJson(response, 404, { error: { message: "Route not found" } });
  });

  const shutdown = async (): Promise<void> => {
    unsubscribeEvents();
    server.close();
    await appServerClient.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(port, host, () => {
    console.log(`Bridge listening on http://${host}:${port}`);
  });
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const message = error instanceof Error ? error.message : "Unknown bridge error";
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
    message.includes("cannot accept same-turn steering")
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

function hasValidAccessToken(
  request: import("node:http").IncomingMessage,
  url: URL
): boolean {
  const authorizationHeader = request.headers.authorization;
  if (authorizationHeader?.startsWith("Bearer ")) {
    return authorizationHeader.slice("Bearer ".length) === bridgeAccessToken;
  }

  return url.searchParams.get("access_token") === bridgeAccessToken;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
