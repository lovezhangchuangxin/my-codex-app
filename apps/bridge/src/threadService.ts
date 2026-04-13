import type {
  BridgeEvent,
  ModelListRequest,
  ModelListResponse,
  RequestRespondRequest,
  RequestRespondResponse,
  ReviewTarget,
  ThreadCompactRequest,
  ThreadCompactResponse,
  ThreadListRequest,
  ThreadListResponse,
  ThreadRenameRequest,
  ThreadRenameResponse,
  ThreadReadResponse,
  ThreadReviewRequest,
  ThreadReviewResponse,
  ThreadStartRequest,
  ThreadStartResponse,
  TurnInterruptRequest,
  TurnInterruptResponse,
  TurnStartRequest,
  TurnStartResponse,
} from '@my-codex-app/protocol';

import { AppServerClient } from './appServerClient';
import type { AppServerReviewTarget } from './appServerClient';
import { resolveProjectIdentityPath } from './projects/projectPathUtils';
import { toAppServerPermissionPreset } from './threads/permissionPresets';
import { ThreadEventTranslator } from './threads/threadEventTranslator';
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
  toTurnDetail,
} from './threads/threadMappers';
import { ThreadRuntimeCache } from './threads/threadRuntimeCache';

export class ThreadService {
  readonly #cache = new ThreadRuntimeCache();
  readonly #eventTranslator = new ThreadEventTranslator(this.#cache);
  readonly #listeners = new Set<(event: BridgeEvent) => void>();
  static readonly ALL_THREADS_PAGE_SIZE = 100;

  constructor(private readonly appServerClient: AppServerClient) {}

  async listThreads(request: ThreadListRequest): Promise<ThreadListResponse> {
    if (request.cwd !== undefined) {
      return this.#listThreadsForProject(request);
    }

    if (request.cursor !== undefined || request.limit !== undefined) {
      const result = await this.appServerClient.listThreads({
        ...(request.cursor !== undefined ? { cursor: request.cursor } : {}),
        ...(request.limit !== undefined ? { limit: request.limit } : {}),
      });

      return {
        data: result.data.map((thread) => {
          this.#cache.setThreadCwd(thread.id, thread.cwd);
          return toThreadSummary(
            thread,
            this.#cache.listPendingRequests(thread.id),
          );
        }),
        ...(result.nextCursor != null ? { nextCursor: result.nextCursor } : {}),
      };
    }

    return this.#listAllThreads();
  }

  async #listAllThreads(): Promise<ThreadListResponse> {
    const threads = await this.#collectAllThreads();
    return {
      data: threads.map((thread) => {
        this.#cache.setThreadCwd(thread.id, thread.cwd);
        return toThreadSummary(
          thread,
          this.#cache.listPendingRequests(thread.id),
        );
      }),
    };
  }

  async #listThreadsForProject(
    request: ThreadListRequest,
  ): Promise<ThreadListResponse> {
    const projectPathKey = resolveProjectIdentityPath(request.cwd);
    if (projectPathKey === null) {
      return { data: [] };
    }

    const threads = await this.#collectAllThreads();
    const matchedThreads = threads.filter(
      (thread) => resolveProjectIdentityPath(thread.cwd) === projectPathKey,
    );

    const limitedThreads =
      request.limit !== undefined
        ? matchedThreads.slice(0, request.limit)
        : matchedThreads;

    return {
      data: limitedThreads.map((thread) => {
        this.#cache.setThreadCwd(thread.id, thread.cwd);
        return toThreadSummary(
          thread,
          this.#cache.listPendingRequests(thread.id),
        );
      }),
    };
  }

  async #collectAllThreads() {
    const threads = [];
    const seenCursors = new Set<string>();
    let cursor: string | null | undefined;

    do {
      const result = await this.appServerClient.listThreads({
        ...(cursor != null ? { cursor } : {}),
        limit: ThreadService.ALL_THREADS_PAGE_SIZE,
      });
      threads.push(...result.data);

      const nextCursor = result.nextCursor ?? null;
      if (nextCursor !== null) {
        if (seenCursors.has(nextCursor)) {
          throw new Error(
            'app-server thread/list returned a duplicate pagination cursor',
          );
        }
        seenCursors.add(nextCursor);
      }

      cursor = nextCursor;
    } while (cursor !== null);

    return threads;
  }

  async listModels(request: ModelListRequest): Promise<ModelListResponse> {
    const result = await this.appServerClient.listModels({
      ...(request.includeHidden !== undefined
        ? { includeHidden: request.includeHidden }
        : {}),
    });

    return {
      data: result.data.map((model) => toAvailableModel(model)),
    };
  }

  async readThread(threadId: string): Promise<ThreadReadResponse> {
    const result = await this.appServerClient.readThread(threadId);
    this.#cache.setThreadCwd(threadId, result.thread.cwd);
    return {
      thread: attachThreadRuntime(
        this.#cache,
        toThreadDetail(
          result.thread,
          this.#cache.listPendingRequests(threadId),
        ),
      ),
    };
  }

  async startThread(request: ThreadStartRequest): Promise<ThreadStartResponse> {
    const result = await this.appServerClient.startThread({
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
    });
    this.#cache.setThreadCwd(result.thread.id, result.thread.cwd);
    this.#cache.setThreadSettings(result.thread.id, toThreadSettings(result));

    return {
      thread: attachThreadRuntime(
        this.#cache,
        toThreadDetail(
          result.thread,
          this.#cache.listPendingRequests(result.thread.id),
        ),
      ),
    };
  }

  async renameThread(
    request: ThreadRenameRequest,
  ): Promise<ThreadRenameResponse> {
    await this.appServerClient.setThreadName({
      threadId: request.threadId,
      name: request.name,
    });

    return {};
  }

  async resumeThread(threadId: string): Promise<void> {
    const result = await this.appServerClient.resumeThread(threadId);
    this.#cache.setThreadCwd(threadId, result.thread.cwd);
    const settings = toThreadSettings(result);
    this.#cache.setThreadSettings(threadId, settings);
    this.#emitBridgeEvent({
      type: 'threadSettingsUpdated',
      threadId,
      settings,
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
      ...this.#toAppServerTurnOverrides(request.threadId, request.settings),
    });

    const nextSettings = mergeThreadSettings(currentSettings, request.settings);
    if (nextSettings) {
      this.#cache.setThreadSettings(request.threadId, nextSettings);
      if (request.settings) {
        this.#emitBridgeEvent({
          type: 'threadSettingsUpdated',
          threadId: request.threadId,
          settings: nextSettings,
        });
      }
    }

    return {
      turn: toTurnDetail(result.turn),
      settings: nextSettings ?? currentSettings,
    };
  }

  async compactThread(
    request: ThreadCompactRequest,
  ): Promise<ThreadCompactResponse> {
    await this.appServerClient.compactThread({
      threadId: request.threadId,
    });

    return {};
  }

  async startReview(
    request: ThreadReviewRequest,
  ): Promise<ThreadReviewResponse> {
    const result = await this.appServerClient.startReview({
      threadId: request.threadId,
      target: toAppServerReviewTarget(request.target),
    });

    return {
      turn: toTurnDetail(result.turn),
      reviewThreadId: result.reviewThreadId,
    };
  }

  async interruptTurn(
    request: TurnInterruptRequest,
  ): Promise<TurnInterruptResponse> {
    await this.appServerClient.interruptTurn({
      threadId: request.threadId,
      turnId: request.turnId,
    });

    return {};
  }

  async respondToRequest(
    request: RequestRespondRequest,
  ): Promise<RequestRespondResponse> {
    const pendingRequest = this.#cache.getPendingRequest(request.requestId);
    if (!pendingRequest) {
      throw new Error('Unknown or resolved pending request');
    }

    switch (request.response.kind) {
      case 'command':
        if (pendingRequest.kind !== 'command') {
          throw new Error('Pending request kind mismatch');
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          decision: this.#eventTranslator.toAppServerCommandDecision(
            request.requestId,
            request.response.decision,
          ),
        });
        break;
      case 'fileChange':
        if (pendingRequest.kind !== 'fileChange') {
          throw new Error('Pending request kind mismatch');
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          decision: this.#eventTranslator.toAppServerFileChangeDecision(
            request.requestId,
            request.response.decision,
          ),
        });
        break;
      case 'permissions':
        if (pendingRequest.kind !== 'permissions') {
          throw new Error('Pending request kind mismatch');
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          permissions: toGrantedPermissionProfile(request.response.permissions),
          scope: request.response.scope,
        });
        break;
      case 'userInput':
        if (pendingRequest.kind !== 'userInput') {
          throw new Error('Pending request kind mismatch');
        }
        this.appServerClient.sendServerRequestResponse(request.requestId, {
          answers: Object.fromEntries(
            Object.entries(request.response.answers).map(
              ([questionId, answer]) => [
                questionId,
                {
                  answers: answer.answers,
                },
              ],
            ),
          ),
        });
        break;
    }

    return {};
  }

  onBridgeEvent(listener: (event: BridgeEvent) => void): () => void {
    this.#listeners.add(listener);
    const onNotification = (notification: {
      method: string;
      params?: unknown;
    }) => {
      const event = this.#eventTranslator.toNotificationBridgeEvent(
        notification.method,
        notification.params,
      );
      if (event) {
        this.#cache.cacheCommandEvent(event);
        this.#emitBridgeEvent(event);
      }
    };
    const onRequest = (request: {
      id: number | string;
      method: string;
      params?: unknown;
    }) => {
      const event = this.#eventTranslator.toRequestBridgeEvent(request);
      if (event) {
        this.#emitBridgeEvent(event);
      }
    };

    this.appServerClient.on('notification', onNotification);
    this.appServerClient.on('request', onRequest);
    return () => {
      this.#listeners.delete(listener);
      this.appServerClient.off('notification', onNotification);
      this.appServerClient.off('request', onRequest);
    };
  }

  #emitBridgeEvent(event: BridgeEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #toAppServerTurnOverrides(
    threadId: string,
    overrides: TurnStartRequest['settings'] | undefined,
  ): Partial<{
    model: string | null;
    effort: ReturnType<typeof toAppServerReasoningEffort>;
    approvalPolicy: ReturnType<
      typeof toAppServerPermissionPreset
    >['approvalPolicy'];
    sandboxPolicy: ReturnType<
      typeof toAppServerPermissionPreset
    >['sandboxPolicy'];
  }> {
    if (!overrides) {
      return {};
    }

    const permissionPreset = overrides.permissionsPreset
      ? toAppServerPermissionPreset(
          this.#cache.getThreadCwd(threadId),
          overrides.permissionsPreset,
        )
      : null;

    return {
      ...(overrides.model !== undefined ? { model: overrides.model } : {}),
      ...(overrides.reasoningEffort !== undefined
        ? { effort: toAppServerReasoningEffort(overrides.reasoningEffort) }
        : {}),
      ...(permissionPreset
        ? {
            approvalPolicy: permissionPreset.approvalPolicy,
            sandboxPolicy: permissionPreset.sandboxPolicy,
          }
        : {}),
    };
  }
}

function toAppServerReviewTarget(target: ReviewTarget): AppServerReviewTarget {
  switch (target.type) {
    case 'uncommittedChanges':
      return { type: 'uncommittedChanges' };
    case 'baseBranch':
      return { type: 'baseBranch', branch: target.branch };
    case 'commit':
      return {
        type: 'commit',
        sha: target.sha,
        ...(target.title !== undefined ? { title: target.title } : {}),
      };
    case 'custom':
      return { type: 'custom', instructions: target.instructions };
  }
}
