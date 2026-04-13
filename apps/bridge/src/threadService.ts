import type {
  AvailableModel,
  BridgeEvent,
  CommandApprovalDecision,
  FileChangeApprovalDecision,
  GrantedPermissionProfile,
  JsonRpcRequestId,
  ModelListRequest,
  ModelListResponse,
  PendingRequest,
  PendingUserInputQuestion,
  ReasoningEffort,
  RequestPermissionProfile,
  RequestRespondRequest,
  RequestRespondResponse,
  ThreadContextUsage,
  ThreadDetail,
  ThreadItem,
  ThreadPermissionPresetId,
  ThreadListRequest,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadRuntimeStatus,
  ThreadSettings,
  ThreadStartRequest,
  ThreadStartResponse,
  ThreadSummary,
  TurnDetail,
  TurnInterruptRequest,
  TurnInterruptResponse,
  TurnStartRequest,
  TurnStartResponse,
  UserInput
} from "@my-codex-app/protocol";

import {
  AppServerClient,
  type AppServerApprovalPolicy,
  type AppServerModel,
  type AppServerReasoningEffort,
  type AppServerSandboxPolicy,
  type AppServerThread,
  type AppServerThreadItem,
  type AppServerThreadTokenUsage,
  type AppServerTurn,
  type AppServerUserInput,
  type ThreadResumeResult,
  type ThreadStartResult
} from "./appServerClient";
import { PendingRequestState } from "./pendingRequestState";

type JsonRpcParams = Record<string, unknown>;

interface AppServerRequestEnvelope {
  id: JsonRpcRequestId;
  method: string;
  params?: unknown;
}

type CommandExecutionItem = Extract<ThreadItem, { type: "commandExecution" }>;
type CachedCommandItem = { turnId: string; item: CommandExecutionItem };

export class ThreadService {
  readonly #pendingRequestState = new PendingRequestState();
  readonly #requestMethodById = new Map<string, string>();
  readonly #commandItemCache = new Map<string, Map<string, CachedCommandItem>>();
  readonly #threadCwdCache = new Map<string, string>();
  readonly #threadSettingsCache = new Map<string, ThreadSettings>();
  readonly #contextUsageCache = new Map<string, ThreadContextUsage>();
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
      data: result.data.map((thread) => this.#toThreadSummary(thread)),
      ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {})
    };
  }

  async listModels(request: ModelListRequest): Promise<ModelListResponse> {
    const result = await this.appServerClient.listModels({
      ...(request.includeHidden !== undefined ? { includeHidden: request.includeHidden } : {})
    });

    return {
      data: result.data.map((model) => this.#toAvailableModel(model))
    };
  }

  async readThread(threadId: string): Promise<ThreadReadResponse> {
    const thread = await this.#readThreadWithSettings(threadId);
    return {
      thread
    };
  }

  async startThread(request: ThreadStartRequest): Promise<ThreadStartResponse> {
    const result = await this.appServerClient.startThread({
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {})
    });
    const thread = this.#toThreadDetail(result.thread);
    const settings = this.#cacheThreadSettings(result.thread.id, result);

    return {
      thread: this.#attachThreadRuntime(thread, result.thread.id, settings)
    };
  }

  async resumeThread(threadId: string): Promise<void> {
    const result = await this.appServerClient.resumeThread(threadId);
    const settings = this.#cacheThreadSettings(threadId, result);
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
    const currentSettings = await this.#ensureThreadSettings(request.threadId);
    const result = await this.appServerClient.startTurn({
      threadId: request.threadId,
      input: request.input.map((input) => this.#toAppServerUserInput(input)),
      ...this.#toAppServerTurnOverrides(request.threadId, request.settings)
    });
    const nextSettings = this.#mergeThreadSettings(currentSettings, request.settings);
    if (nextSettings) {
      this.#threadSettingsCache.set(request.threadId, nextSettings);
      if (request.settings) {
        this.#emitBridgeEvent({
          type: "threadSettingsUpdated",
          threadId: request.threadId,
          settings: nextSettings
        });
      }
    }

    return {
      turn: this.#toTurnDetail(result.turn),
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
    const pendingRequest = this.#pendingRequestState.get(request.requestId);
    if (!pendingRequest) {
      throw new Error("Unknown or resolved pending request");
    }
    const requestMethod = this.#requestMethodById.get(toRequestKey(request.requestId));

    switch (request.response.kind) {
      case "command":
        if (pendingRequest.kind !== "command") {
          throw new Error("Pending request kind mismatch");
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          decision: this.#toAppServerCommandDecision(request.response.decision, requestMethod)
        });
        break;
      case "fileChange":
        if (pendingRequest.kind !== "fileChange") {
          throw new Error("Pending request kind mismatch");
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          decision: this.#toAppServerFileChangeDecision(request.response.decision, requestMethod)
        });
        break;
      case "permissions":
        if (pendingRequest.kind !== "permissions") {
          throw new Error("Pending request kind mismatch");
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          permissions: this.#toGrantedPermissionProfile(request.response.permissions),
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
      const event = this.#toBridgeEvent(notification.method, notification.params);
      if (event) {
        this.#cacheCommandEvent(event);
        this.#emitBridgeEvent(event);
      }
    };
    const onRequest = (request: AppServerRequestEnvelope) => {
      const event = this.#toRequestBridgeEvent(request);
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

  #toThreadSummary(thread: AppServerThread): ThreadSummary {
    this.#threadCwdCache.set(thread.id, thread.cwd);
    return {
      id: thread.id,
      preview: thread.preview,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      cwd: thread.cwd,
      modelProvider: thread.modelProvider,
      status: this.#toRuntimeStatus(thread.status),
      pendingRequests: this.#pendingRequestState.listForThread(thread.id),
      ...(thread.name !== undefined ? { name: thread.name } : {})
    };
  }

  #toThreadDetail(thread: AppServerThread): ThreadDetail {
    return {
      ...this.#toThreadSummary(thread),
      turns: (thread.turns ?? []).map((turn) => this.#toTurnDetail(turn)),
      settings: null,
      contextUsage: null
    };
  }

  #toTurnDetail(turn: AppServerTurn): TurnDetail {
    return {
      id: turn.id,
      status: turn.status,
      ...(turn.startedAt !== undefined ? { startedAt: turn.startedAt } : {}),
      ...(turn.completedAt !== undefined ? { completedAt: turn.completedAt } : {}),
      ...(turn.durationMs !== undefined ? { durationMs: turn.durationMs } : {}),
      ...(turn.error
        ? {
            error: {
              message: turn.error.message,
              ...(turn.error.additionalDetails !== undefined
                ? { additionalDetails: turn.error.additionalDetails }
                : {})
            }
          }
        : {}),
      items: turn.items.map((item) => this.#toThreadItem(item))
    };
  }

  #cacheCommandEvent(event: BridgeEvent): void {
    if (event.type !== "itemStarted" && event.type !== "itemCompleted") {
      return;
    }

    if (event.item.type !== "commandExecution") {
      return;
    }

    const { threadId, turnId, item } = event;
    let threadCache = this.#commandItemCache.get(threadId);
    if (!threadCache) {
      threadCache = new Map();
      this.#commandItemCache.set(threadId, threadCache);
    }

    const existing = threadCache.get(item.id);
    // itemCompleted has fuller data (output, exitCode, duration) — always prefer it
    if (existing && event.type === "itemStarted") {
      return;
    }

    threadCache.set(item.id, { turnId, item });
  }

  #mergeCachedCommandItems(threadId: string, thread: ThreadDetail): ThreadDetail {
    const threadCache = this.#commandItemCache.get(threadId);
    if (!threadCache || threadCache.size === 0) {
      return thread;
    }

    const turnMap = new Map(thread.turns.map((turn) => [turn.id, turn]));
    const itemIdsInTurns = new Set(thread.turns.flatMap((turn) => turn.items.map((item) => item.id)));

    for (const [itemId, cached] of threadCache) {
      // Only insert items not already present in the turn
      if (itemIdsInTurns.has(itemId)) {
        continue;
      }

      const turn = turnMap.get(cached.turnId);
      if (!turn) {
        continue;
      }

      const updatedTurn: TurnDetail = {
        ...turn,
        items: [...turn.items, cached.item]
      };
      turnMap.set(cached.turnId, updatedTurn);
    }

    return { ...thread, turns: thread.turns.map((turn) => turnMap.get(turn.id) ?? turn) };
  }

  async #readThreadWithSettings(threadId: string): Promise<ThreadDetail> {
    const result = await this.appServerClient.readThread(threadId);
    const thread = this.#toThreadDetail(result.thread);
    return this.#attachThreadRuntime(
      thread,
      threadId,
      this.#threadSettingsCache.get(threadId) ?? null
    );
  }

  async #ensureThreadSettings(threadId: string): Promise<ThreadSettings | null> {
    return this.#threadSettingsCache.get(threadId) ?? null;
  }

  #attachThreadRuntime(
    thread: ThreadDetail,
    threadId: string,
    settings: ThreadSettings | null
  ): ThreadDetail {
    const merged = this.#mergeCachedCommandItems(threadId, thread);
    return {
      ...merged,
      settings,
      contextUsage: this.#contextUsageCache.get(threadId) ?? null
    };
  }

  #cacheThreadSettings(
    threadId: string,
    result: ThreadStartResult | ThreadResumeResult
  ): ThreadSettings {
    this.#threadCwdCache.set(threadId, result.thread.cwd);

    const settings: ThreadSettings = {
      model: result.model,
      reasoningEffort: this.#toReasoningEffort(result.reasoningEffort),
      permissionsPreset: this.#derivePermissionPreset(result.approvalPolicy, result.sandbox)
    };
    this.#threadSettingsCache.set(threadId, settings);
    return settings;
  }

  #mergeThreadSettings(
    current: ThreadSettings | null,
    overrides: TurnStartRequest["settings"] | undefined
  ): ThreadSettings | null {
    if (!current && !overrides) {
      return null;
    }

    return {
      model: overrides?.model !== undefined ? overrides.model : current?.model ?? null,
      reasoningEffort:
        overrides?.reasoningEffort !== undefined
          ? overrides.reasoningEffort
          : current?.reasoningEffort ?? null,
      permissionsPreset:
        overrides?.permissionsPreset !== undefined
          ? overrides.permissionsPreset
          : current?.permissionsPreset ?? null
    };
  }

  #toAppServerTurnOverrides(
    threadId: string,
    overrides: TurnStartRequest["settings"] | undefined
  ): Partial<{
    model: string | null;
    effort: AppServerReasoningEffort | null;
    approvalPolicy: AppServerApprovalPolicy;
    sandboxPolicy: AppServerSandboxPolicy;
  }> {
    if (!overrides) {
      return {};
    }

    const permissionPreset = overrides.permissionsPreset
      ? this.#toAppServerPermissionPreset(threadId, overrides.permissionsPreset)
      : null;

    return {
      ...(overrides.model !== undefined ? { model: overrides.model } : {}),
      ...(overrides.reasoningEffort !== undefined
        ? { effort: this.#toAppServerReasoningEffort(overrides.reasoningEffort) }
        : {}),
      ...(permissionPreset
        ? {
            approvalPolicy: permissionPreset.approvalPolicy,
            sandboxPolicy: permissionPreset.sandboxPolicy
          }
        : {})
    };
  }

  #toAppServerPermissionPreset(
    threadId: string,
    preset: ThreadPermissionPresetId
  ): {
    approvalPolicy: AppServerApprovalPolicy;
    sandboxPolicy: AppServerSandboxPolicy;
  } {
    switch (preset) {
      case "read-only":
        return {
          approvalPolicy: "on-request",
          sandboxPolicy: {
            type: "readOnly",
            access: { type: "fullAccess" },
            networkAccess: false
          }
        };
      case "auto":
        return {
          approvalPolicy: "on-request",
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: this.#threadCwdCache.get(threadId)
              ? [this.#threadCwdCache.get(threadId) as string]
              : [],
            readOnlyAccess: { type: "fullAccess" },
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          }
        };
      case "full-access":
        return {
          approvalPolicy: "never",
          sandboxPolicy: {
            type: "dangerFullAccess"
          }
        };
    }
  }

  #derivePermissionPreset(
    approvalPolicy: AppServerApprovalPolicy,
    sandboxPolicy: AppServerSandboxPolicy
  ): ThreadPermissionPresetId | null {
    if (approvalPolicy === "on-request" && sandboxPolicy.type === "readOnly") {
      return "read-only";
    }
    if (approvalPolicy === "on-request" && sandboxPolicy.type === "workspaceWrite") {
      return "auto";
    }
    if (approvalPolicy === "never" && sandboxPolicy.type === "dangerFullAccess") {
      return "full-access";
    }
    return null;
  }

  #toReasoningEffort(value: AppServerReasoningEffort | null): ReasoningEffort | null {
    return value;
  }

  #toAppServerReasoningEffort(value: ReasoningEffort | null): AppServerReasoningEffort | null {
    return value;
  }

  #toAvailableModel(model: AppServerModel): AvailableModel {
    return {
      id: model.id,
      model: model.model,
      displayName: model.displayName,
      description: model.description,
      hidden: model.hidden,
      defaultReasoningEffort: model.defaultReasoningEffort,
      supportedReasoningEfforts: model.supportedReasoningEfforts.map((option) => ({
        reasoningEffort: option.reasoningEffort,
        description: option.description
      })),
      supportsPersonality: model.supportsPersonality,
      isDefault: model.isDefault
    };
  }

  #toThreadContextUsage(tokenUsage: AppServerThreadTokenUsage): ThreadContextUsage {
    return {
      total: {
        totalTokens: tokenUsage.total.totalTokens,
        inputTokens: tokenUsage.total.inputTokens,
        cachedInputTokens: tokenUsage.total.cachedInputTokens,
        outputTokens: tokenUsage.total.outputTokens,
        reasoningOutputTokens: tokenUsage.total.reasoningOutputTokens
      },
      last: {
        totalTokens: tokenUsage.last.totalTokens,
        inputTokens: tokenUsage.last.inputTokens,
        cachedInputTokens: tokenUsage.last.cachedInputTokens,
        outputTokens: tokenUsage.last.outputTokens,
        reasoningOutputTokens: tokenUsage.last.reasoningOutputTokens
      },
      modelContextWindow: tokenUsage.modelContextWindow
    };
  }

  #toBridgeEvent(method: string, params: unknown): BridgeEvent | null {
    const payload = this.#toObject(params);
    if (!payload) {
      return null;
    }

    switch (method) {
      case "thread/started": {
        const rawThread = payload.thread as AppServerThread;
        const thread = this.#attachThreadRuntime(
          this.#toThreadDetail(rawThread),
          rawThread.id,
          this.#threadSettingsCache.get(rawThread.id) ?? null
        );
        return { type: "threadStarted", threadId: thread.id, thread };
      }
      case "thread/status/changed": {
        const threadId = asString(payload.threadId);
        const status = this.#toRuntimeStatus(payload.status as AppServerThread["status"]);
        return threadId ? { type: "threadStatusChanged", threadId, status } : null;
      }
      case "turn/started": {
        const threadId = asString(payload.threadId);
        const turn = this.#toTurnDetail(payload.turn as AppServerTurn);
        return threadId ? { type: "turnStarted", threadId, turn } : null;
      }
      case "turn/completed": {
        const threadId = asString(payload.threadId);
        const turn = this.#toTurnDetail(payload.turn as AppServerTurn);
        return threadId ? { type: "turnCompleted", threadId, turn } : null;
      }
      case "item/started": {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const item = this.#toThreadItem(payload.item as AppServerThreadItem);
        return threadId && turnId ? { type: "itemStarted", threadId, turnId, item } : null;
      }
      case "item/completed": {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const item = this.#toThreadItem(payload.item as AppServerThreadItem);
        return threadId && turnId ? { type: "itemCompleted", threadId, turnId, item } : null;
      }
      case "item/agentMessage/delta": {
        const threadId = asString(payload.threadId);
        const turnId = asString(payload.turnId);
        const itemId = asString(payload.itemId);
        const delta = asString(payload.delta);
        return threadId && turnId && itemId && delta !== null
          ? { type: "agentMessageDelta", threadId, turnId, itemId, delta }
          : null;
      }
      case "thread/tokenUsage/updated": {
        const threadId = asString(payload.threadId);
        const tokenUsage = this.#toObject(payload.tokenUsage) as AppServerThreadTokenUsage | null;
        if (!threadId || !tokenUsage) {
          return null;
        }

        const contextUsage = this.#toThreadContextUsage(tokenUsage);
        this.#contextUsageCache.set(threadId, contextUsage);
        return {
          type: "threadContextUsageUpdated",
          threadId,
          contextUsage
        };
      }
      case "serverRequest/resolved": {
        const threadId = asString(payload.threadId);
        const requestId = asRequestId(payload.requestId);
        if (!threadId || requestId === null) {
          return null;
        }

        this.#pendingRequestState.resolve(requestId);
        this.#requestMethodById.delete(toRequestKey(requestId));
        return { type: "pendingRequestResolved", threadId, requestId };
      }
      case "thread/closed": {
        const threadId = asString(payload.threadId);
        if (threadId) {
          this.#pendingRequestState.clearThread(threadId);
        }
        return null;
      }
      default:
        return null;
    }
  }

  #toRequestBridgeEvent(request: AppServerRequestEnvelope): BridgeEvent | null {
    const nextRequest = this.#toPendingRequest(request);
    if (!nextRequest) {
      return null;
    }

    this.#pendingRequestState.upsert(nextRequest);
    this.#requestMethodById.set(toRequestKey(request.id), request.method);
    return {
      type: "pendingRequestAdded",
      threadId: nextRequest.threadId,
      request: nextRequest
    };
  }

  #toPendingRequest(request: AppServerRequestEnvelope): PendingRequest | null {
    const params = this.#toObject(request.params);
    if (!params) {
      return null;
    }

    const requestedAt = nowInSeconds();
    switch (request.method) {
      case "item/commandExecution/requestApproval": {
        const threadId = asString(params.threadId);
        const turnId = asString(params.turnId);
        const itemId = asString(params.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        const approvalId = asString(params.approvalId);
        const reason = asString(params.reason);
        const command = asString(params.command);
        const cwd = asString(params.cwd);
        return {
          kind: "command",
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          ...(approvalId ? { approvalId } : {}),
          ...(reason ? { reason } : {}),
          ...(command ? { command } : {}),
          ...(cwd ? { cwd } : {})
        };
      }
      case "execCommandApproval": {
        const threadId = asString(params.conversationId);
        const turnId = "";
        const itemId = asString(params.callId);
        if (!threadId || !itemId) {
          return null;
        }

        const command =
          Array.isArray(params.command) && params.command.every(isString)
            ? params.command.join(" ")
            : undefined;
        const approvalId = asString(params.approvalId);
        const reason = asString(params.reason);
        const cwd = asString(params.cwd);
        return {
          kind: "command",
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          ...(approvalId ? { approvalId } : {}),
          ...(reason ? { reason } : {}),
          ...(command ? { command } : {}),
          ...(cwd ? { cwd } : {})
        };
      }
      case "item/fileChange/requestApproval": {
        const threadId = asString(params.threadId);
        const turnId = asString(params.turnId);
        const itemId = asString(params.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        const reason = asString(params.reason);
        const grantRoot = asString(params.grantRoot);
        return {
          kind: "fileChange",
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          ...(reason ? { reason } : {}),
          ...(grantRoot ? { grantRoot } : {})
        };
      }
      case "applyPatchApproval": {
        const threadId = asString(params.conversationId);
        const itemId = asString(params.callId);
        if (!threadId || !itemId) {
          return null;
        }

        const reason = asString(params.reason);
        const grantRoot = asString(params.grantRoot);
        return {
          kind: "fileChange",
          requestId: request.id,
          threadId,
          turnId: "",
          itemId,
          requestedAt,
          ...(reason ? { reason } : {}),
          ...(grantRoot ? { grantRoot } : {})
        };
      }
      case "item/permissions/requestApproval": {
        const threadId = asString(params.threadId);
        const turnId = asString(params.turnId);
        const itemId = asString(params.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        const reason = asString(params.reason);
        return {
          kind: "permissions",
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          ...(reason ? { reason } : {}),
          permissions: this.#toRequestPermissionProfile(params.permissions)
        };
      }
      case "item/tool/requestUserInput": {
        const threadId = asString(params.threadId);
        const turnId = asString(params.turnId);
        const itemId = asString(params.itemId);
        if (!threadId || !turnId || !itemId) {
          return null;
        }

        return {
          kind: "userInput",
          requestId: request.id,
          threadId,
          turnId,
          itemId,
          requestedAt,
          questions: Array.isArray(params.questions)
            ? params.questions.flatMap((question) => {
                const nextQuestion = this.#toPendingUserInputQuestion(question);
                return nextQuestion ? [nextQuestion] : [];
              })
            : []
        };
      }
      default:
        return null;
    }
  }

  #toRequestPermissionProfile(value: unknown): RequestPermissionProfile {
    const payload = this.#toObject(value);
    if (!payload) {
      return {};
    }

    const network = this.#toObject(payload.network);
    const fileSystem = this.#toObject(payload.fileSystem);

    return {
      ...(network && typeof network.enabled === "boolean" ? { network: { enabled: network.enabled } } : {}),
      ...(fileSystem
        ? {
            fileSystem: {
              ...(Array.isArray(fileSystem.read)
                ? { read: fileSystem.read.filter(isString) }
                : {}),
              ...(Array.isArray(fileSystem.write)
                ? { write: fileSystem.write.filter(isString) }
                : {})
            }
          }
        : {})
    };
  }

  #toGrantedPermissionProfile(value: GrantedPermissionProfile): Record<string, unknown> {
    return {
      ...(value.network ? { network: { enabled: value.network.enabled ?? null } } : {}),
      ...(value.fileSystem
        ? {
            fileSystem: {
              read: value.fileSystem.read ?? null,
              write: value.fileSystem.write ?? null
            }
          }
        : {})
    };
  }

  #toPendingUserInputQuestion(value: unknown): PendingUserInputQuestion | null {
    const payload = this.#toObject(value);
    const id = payload ? asString(payload.id) : null;
    const header = payload ? asString(payload.header) : null;
    const question = payload ? asString(payload.question) : null;
    if (!payload || !id || !header || !question) {
      return null;
    }

    return {
      id,
      header,
      question,
      isOther: payload.isOther === true,
      isSecret: payload.isSecret === true,
      ...(Array.isArray(payload.options)
        ? {
            options: payload.options.flatMap((option) => {
              const nextOption = this.#toPendingUserInputQuestionOption(option);
              return nextOption ? [nextOption] : [];
            })
          }
        : {})
    };
  }

  #toPendingUserInputQuestionOption(
    value: unknown
  ): NonNullable<PendingUserInputQuestion["options"]>[number] | null {
    const payload = this.#toObject(value);
    const label = payload ? asString(payload.label) : null;
    const description = payload ? asString(payload.description) : null;
    if (!payload || !label || !description) {
      return null;
    }

    return {
      label,
      description
    };
  }

  #toThreadItem(item: AppServerThreadItem): ThreadItem {
    switch (item.type) {
      case "userMessage":
        return {
          type: "userMessage",
          id: item.id,
          content: Array.isArray(item.content)
            ? item.content.map((input) => this.#toUserInput(input as Record<string, unknown>))
            : []
        };
      case "agentMessage":
        return {
          type: "agentMessage",
          id: item.id,
          text: typeof item.text === "string" ? item.text : ""
        };
      case "reasoning":
        return {
          type: "reasoning",
          id: item.id,
          summary: Array.isArray(item.summary) ? item.summary.filter(isString) : [],
          content: Array.isArray(item.content) ? item.content.filter(isString) : []
        };
      case "commandExecution":
        return {
          type: "commandExecution",
          id: item.id,
          command: typeof item.command === "string" ? item.command : "",
          cwd: typeof item.cwd === "string" ? item.cwd : "",
          status: typeof item.status === "string" ? item.status : "unknown",
          ...(typeof item.aggregatedOutput === "string"
            ? { aggregatedOutput: item.aggregatedOutput }
            : {}),
          ...(typeof item.exitCode === "number" ? { exitCode: item.exitCode } : {}),
          ...(typeof item.durationMs === "number" ? { durationMs: item.durationMs } : {})
        };
      case "fileChange":
        return {
          type: "fileChange",
          id: item.id,
          status: typeof item.status === "string" ? item.status : "unknown",
          changes: Array.isArray(item.changes)
            ? item.changes.map((change) => {
                const next =
                  typeof change === "object" && change !== null
                    ? (change as Record<string, unknown>)
                    : {};
                return {
                  path: typeof next.path === "string" ? next.path : "unknown",
                  ...(typeof next.kind === "string" ? { kind: next.kind } : {}),
                  ...(typeof next.diff === "string" ? { diff: next.diff } : {})
                };
              })
            : []
        };
      case "webSearch":
        return {
          type: "webSearch",
          id: item.id,
          query: typeof item.query === "string" ? item.query : ""
        };
      case "imageView":
        return {
          type: "imageView",
          id: item.id,
          path: typeof item.path === "string" ? item.path : ""
        };
      default:
        return {
          type: "unknown",
          id: item.id,
          title: item.type,
          raw: item
        };
    }
  }

  #toUserInput(input: Record<string, unknown>): UserInput {
    switch (input.type) {
      case "text":
        return { type: "text", text: typeof input.text === "string" ? input.text : "" };
      case "image":
        return { type: "image", url: typeof input.url === "string" ? input.url : "" };
      case "localImage":
        return { type: "localImage", path: typeof input.path === "string" ? input.path : "" };
      case "skill":
        return {
          type: "skill",
          name: typeof input.name === "string" ? input.name : "",
          path: typeof input.path === "string" ? input.path : ""
        };
      case "mention":
        return {
          type: "mention",
          name: typeof input.name === "string" ? input.name : "",
          path: typeof input.path === "string" ? input.path : ""
        };
      default:
        return { type: "text", text: "" };
    }
  }

  #toAppServerUserInput(input: UserInput): AppServerUserInput {
    switch (input.type) {
      case "text":
        return { type: "text", text: input.text, textElements: [] };
      case "image":
        return { type: "image", url: input.url };
      case "localImage":
        return { type: "localImage", path: input.path };
      case "skill":
        return { type: "skill", name: input.name, path: input.path };
      case "mention":
        return { type: "mention", name: input.name, path: input.path };
    }
  }

  #toRuntimeStatus(status: AppServerThread["status"]): ThreadRuntimeStatus {
    switch (status.type) {
      case "notLoaded":
        return { type: "notLoaded" };
      case "idle":
        return { type: "idle" };
      case "systemError":
        return { type: "systemError" };
      case "active":
        return {
          type: "active",
          activeFlags: status.activeFlags ?? []
        };
    }
  }

  #toObject(value: unknown): JsonRpcParams | null {
    return typeof value === "object" && value !== null ? (value as JsonRpcParams) : null;
  }

  #toAppServerCommandDecision(
    decision: CommandApprovalDecision,
    requestMethod: string | undefined
  ): string {
    if (requestMethod === "execCommandApproval") {
      switch (decision) {
        case "accept":
          return "approved";
        case "acceptForSession":
          return "approved_for_session";
        case "decline":
          return "denied";
        case "cancel":
          return "abort";
      }
    }

    return decision;
  }

  #toAppServerFileChangeDecision(
    decision: FileChangeApprovalDecision,
    requestMethod: string | undefined
  ): string {
    if (requestMethod === "applyPatchApproval") {
      switch (decision) {
        case "accept":
          return "approved";
        case "acceptForSession":
          return "approved_for_session";
        case "decline":
          return "denied";
        case "cancel":
          return "abort";
      }
    }

    return decision;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asRequestId(value: unknown): JsonRpcRequestId | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function toRequestKey(requestId: JsonRpcRequestId): string {
  return typeof requestId === "string" ? `string:${requestId}` : `number:${requestId}`;
}
