import type {
  BridgeEvent,
  ModelListRequest,
  ModelListResponse,
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

import { AppServerClient } from "./appServerClient";
import { toAppServerPermissionPreset } from "./threads/permissionPresets";
import { ThreadEventTranslator } from "./threads/threadEventTranslator";
import {
  attachThreadRuntime,
  mergeThreadSettings,
  toAppServerReasoningEffort,
  toAppServerUserInput,
  toAvailableModel,
  toGrantedPermissionProfile,
  toThreadDetail,
  toThreadSettings,
  toThreadSummary,
  toTurnDetail
} from "./threads/threadMappers";
import { ThreadRuntimeCache } from "./threads/threadRuntimeCache";

export class ThreadService {
  readonly #cache = new ThreadRuntimeCache();
  readonly #eventTranslator = new ThreadEventTranslator(this.#cache);
  readonly #listeners = new Set<(event: BridgeEvent) => void>();

  constructor(private readonly appServerClient: AppServerClient) {}

  async listThreads(request: ThreadListRequest): Promise<ThreadListResponse> {
    const params = {
      ...(request.cursor !== undefined ? { cursor: request.cursor } : {}),
      ...(request.limit !== undefined ? { limit: request.limit } : {})
    };
    const result = await this.appServerClient.listThreads({
      ...params
    });

    return {
      data: result.data.map((thread) => {
        this.#cache.setThreadCwd(thread.id, thread.cwd);
        return toThreadSummary(thread, this.#cache.listPendingRequests(thread.id));
      }),
      ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {})
    };
  }

  async listModels(request: ModelListRequest): Promise<ModelListResponse> {
    const result = await this.appServerClient.listModels({
      ...(request.includeHidden !== undefined ? { includeHidden: request.includeHidden } : {})
    });

    return {
      data: result.data.map((model) => toAvailableModel(model))
    };
  }

  async readThread(threadId: string): Promise<ThreadReadResponse> {
    const result = await this.appServerClient.readThread(threadId);
    this.#cache.setThreadCwd(threadId, result.thread.cwd);
    return {
      thread: attachThreadRuntime(
        this.#cache,
        toThreadDetail(result.thread, this.#cache.listPendingRequests(threadId))
      )
    };
  }

  async startThread(request: ThreadStartRequest): Promise<ThreadStartResponse> {
    const result = await this.appServerClient.startThread({
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {})
    });
    this.#cache.setThreadCwd(result.thread.id, result.thread.cwd);
    this.#cache.setThreadSettings(result.thread.id, toThreadSettings(result));

    return {
      thread: attachThreadRuntime(
        this.#cache,
        toThreadDetail(result.thread, this.#cache.listPendingRequests(result.thread.id))
      )
    };
  }

  async resumeThread(threadId: string): Promise<void> {
    const result = await this.appServerClient.resumeThread(threadId);
    this.#cache.setThreadCwd(threadId, result.thread.cwd);
    const settings = toThreadSettings(result);
    this.#cache.setThreadSettings(threadId, settings);
    this.#emitBridgeEvent({
      type: "threadSettingsUpdated",
      threadId,
      settings
    });
  }

  async unsubscribeThread(threadId: string): Promise<void> {
    await this.appServerClient.unsubscribeThread(threadId);
  }

  async startTurn(request: TurnStartRequest): Promise<TurnStartResponse> {
    const currentSettings = this.#cache.getThreadSettings(request.threadId);
    const result = await this.appServerClient.startTurn({
      threadId: request.threadId,
      input: request.input.map((input) => toAppServerUserInput(input)),
      ...this.#toAppServerTurnOverrides(request.threadId, request.settings)
    });

    const nextSettings = mergeThreadSettings(currentSettings, request.settings);
    if (nextSettings) {
      this.#cache.setThreadSettings(request.threadId, nextSettings);
      if (request.settings) {
        this.#emitBridgeEvent({
          type: "threadSettingsUpdated",
          threadId: request.threadId,
          settings: nextSettings
        });
      }
    }

    return {
      turn: toTurnDetail(result.turn),
      settings: nextSettings ?? currentSettings
    };
  }

  async interruptTurn(request: TurnInterruptRequest): Promise<TurnInterruptResponse> {
    await this.appServerClient.interruptTurn({
      threadId: request.threadId,
      turnId: request.turnId
    });

    return {};
  }

  async respondToRequest(request: RequestRespondRequest): Promise<RequestRespondResponse> {
    const pendingRequest = this.#cache.getPendingRequest(request.requestId);
    if (!pendingRequest) {
      throw new Error("Unknown or resolved pending request");
    }

    switch (request.response.kind) {
      case "command":
        if (pendingRequest.kind !== "command") {
          throw new Error("Pending request kind mismatch");
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          decision: this.#eventTranslator.toAppServerCommandDecision(
            request.requestId,
            request.response.decision
          )
        });
        break;
      case "fileChange":
        if (pendingRequest.kind !== "fileChange") {
          throw new Error("Pending request kind mismatch");
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          decision: this.#eventTranslator.toAppServerFileChangeDecision(
            request.requestId,
            request.response.decision
          )
        });
        break;
      case "permissions":
        if (pendingRequest.kind !== "permissions") {
          throw new Error("Pending request kind mismatch");
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          permissions: toGrantedPermissionProfile(request.response.permissions),
          scope: request.response.scope
        });
        break;
      case "userInput":
        if (pendingRequest.kind !== "userInput") {
          throw new Error("Pending request kind mismatch");
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          answers: Object.fromEntries(
            Object.entries(request.response.answers).map(([questionId, answer]) => [
              questionId,
              {
                answers: answer.answers
              }
            ])
          )
        });
        break;
    }

    return {};
  }

  onBridgeEvent(listener: (event: BridgeEvent) => void): () => void {
    this.#listeners.add(listener);
    const onNotification = (notification: { method: string; params?: unknown }) => {
      const event = this.#eventTranslator.toNotificationBridgeEvent(
        notification.method,
        notification.params
      );
      if (event) {
        this.#cache.cacheCommandEvent(event);
        this.#emitBridgeEvent(event);
      }
    };
    const onRequest = (request: { id: number | string; method: string; params?: unknown }) => {
      const event = this.#eventTranslator.toRequestBridgeEvent(request);
      if (event) {
        this.#emitBridgeEvent(event);
      }
    };

    this.appServerClient.on("notification", onNotification);
    this.appServerClient.on("request", onRequest);
    return () => {
      this.#listeners.delete(listener);
      this.appServerClient.off("notification", onNotification);
      this.appServerClient.off("request", onRequest);
    };
  }

  #emitBridgeEvent(event: BridgeEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #toAppServerTurnOverrides(
    threadId: string,
    overrides: TurnStartRequest["settings"] | undefined
  ): Partial<{
    model: string | null;
    effort: ReturnType<typeof toAppServerReasoningEffort>;
    approvalPolicy: ReturnType<typeof toAppServerPermissionPreset>["approvalPolicy"];
    sandboxPolicy: ReturnType<typeof toAppServerPermissionPreset>["sandboxPolicy"];
  }> {
    if (!overrides) {
      return {};
    }

    const permissionPreset = overrides.permissionsPreset
      ? toAppServerPermissionPreset(this.#cache.getThreadCwd(threadId), overrides.permissionsPreset)
      : null;

    return {
      ...(overrides.model !== undefined ? { model: overrides.model } : {}),
      ...(overrides.reasoningEffort !== undefined
        ? { effort: toAppServerReasoningEffort(overrides.reasoningEffort) }
        : {}),
      ...(permissionPreset
        ? {
            approvalPolicy: permissionPreset.approvalPolicy,
            sandboxPolicy: permissionPreset.sandboxPolicy
          }
        : {})
    };
  }
}
