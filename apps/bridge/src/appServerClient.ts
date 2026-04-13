import { EventEmitter } from 'node:events';

import { JsonRpcProcessClient } from './app-server/jsonRpcProcessClient';
import type {
  FsReadDirectoryParams,
  FsReadDirectoryResult,
  FsReadFileParams,
  FsReadFileResult,
  InitializeParams,
  InitializeResult,
  ModelListParams,
  ModelListResult,
  NotificationEnvelope,
  ReviewStartParams,
  ReviewStartResult,
  RequestEnvelope,
  ThreadCompactStartParams,
  ThreadCompactStartResult,
  ThreadListParams,
  ThreadListResult,
  ThreadReadParams,
  ThreadReadResult,
  ThreadResumeParams,
  ThreadResumeResult,
  ThreadSetNameParams,
  ThreadSetNameResult,
  ThreadStartParams,
  ThreadStartResult,
  ThreadUnsubscribeParams,
  TurnInterruptParams,
  TurnStartParams,
  TurnStartResult,
} from './app-server/types';

export type {
  AppServerApprovalPolicy,
  AppServerModel,
  AppServerModelReasoningEffortOption,
  AppServerReviewDelivery,
  AppServerReviewTarget,
  AppServerReasoningEffort,
  AppServerSandboxPolicy,
  AppServerThread,
  AppServerThreadItem,
  AppServerThreadStatus,
  AppServerThreadTokenUsage,
  AppServerTokenUsageBreakdown,
  AppServerTurn,
  AppServerTurnError,
  AppServerUserInput,
  InitializeResult,
  NotificationEnvelope,
  ReviewStartResult,
  RequestEnvelope,
  ThreadCompactStartResult,
  ThreadReadResult,
  ThreadResumeResult,
  ThreadStartResult,
} from './app-server/types';

export class AppServerClient extends EventEmitter {
  readonly #transport: JsonRpcProcessClient;
  #initialized = false;

  constructor(
    private readonly command = 'codex',
    private readonly args = ['app-server'],
  ) {
    super();
    this.#transport = new JsonRpcProcessClient(this.command, this.args);
    this.#transport.on('notification', (notification: NotificationEnvelope) => {
      this.emit('notification', notification);
    });
    this.#transport.on('request', (request: RequestEnvelope) => {
      this.emit('request', request);
    });
  }

  async initialize(): Promise<InitializeResult> {
    if (this.#initialized) {
      throw new Error('App-server client is already initialized');
    }

    const response = await this.#transport.sendRequest<
      InitializeParams,
      InitializeResult
    >('initialize', {
      clientInfo: {
        name: 'my_codex_app_bridge',
        title: 'My Codex App Bridge',
        version: '0.1.0',
      },
    });

    this.#transport.sendNotification('notifications/initialized', {});
    this.#initialized = true;
    return response;
  }

  async listThreads(params: ThreadListParams): Promise<ThreadListResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<ThreadListParams, ThreadListResult>(
      'thread/list',
      params,
    );
  }

  async readThread(threadId: string): Promise<ThreadReadResult> {
    return this.#readThread(threadId, true);
  }

  async readThreadSummary(threadId: string): Promise<ThreadReadResult> {
    return this.#readThread(threadId, false);
  }

  async startThread(params: ThreadStartParams): Promise<ThreadStartResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<ThreadStartParams, ThreadStartResult>(
      'thread/start',
      params,
    );
  }

  async setThreadName(
    params: ThreadSetNameParams,
  ): Promise<ThreadSetNameResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<
      ThreadSetNameParams,
      ThreadSetNameResult
    >('thread/name/set', params);
  }

  async resumeThread(threadId: string): Promise<ThreadResumeResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<ThreadResumeParams, ThreadResumeResult>(
      'thread/resume',
      {
        threadId,
      },
    );
  }

  async unsubscribeThread(threadId: string): Promise<void> {
    this.#assertInitialized();
    await this.#transport.sendRequest<ThreadUnsubscribeParams, unknown>(
      'thread/unsubscribe',
      {
        threadId,
      },
    );
  }

  async compactThread(
    params: ThreadCompactStartParams,
  ): Promise<ThreadCompactStartResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<
      ThreadCompactStartParams,
      ThreadCompactStartResult
    >('thread/compact/start', params);
  }

  async startReview(params: ReviewStartParams): Promise<ReviewStartResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<ReviewStartParams, ReviewStartResult>(
      'review/start',
      params,
    );
  }

  async startTurn(params: TurnStartParams): Promise<TurnStartResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<TurnStartParams, TurnStartResult>(
      'turn/start',
      params,
    );
  }

  async listModels(params: ModelListParams): Promise<ModelListResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<ModelListParams, ModelListResult>(
      'model/list',
      params,
    );
  }

  async interruptTurn(params: TurnInterruptParams): Promise<void> {
    this.#assertInitialized();
    await this.#transport.sendRequest<TurnInterruptParams, unknown>(
      'turn/interrupt',
      params,
    );
  }

  async readFile(path: string): Promise<FsReadFileResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<FsReadFileParams, FsReadFileResult>(
      'fs/readFile',
      {
        path,
      },
    );
  }

  async readDirectory(path: string): Promise<FsReadDirectoryResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<
      FsReadDirectoryParams,
      FsReadDirectoryResult
    >('fs/readDirectory', {
      path,
    });
  }

  sendServerRequestResponse(id: number | string, result: unknown): void {
    this.#transport.sendResponse(id, result);
  }

  async close(): Promise<void> {
    await this.#transport.close();
  }

  async #readThread(
    threadId: string,
    includeTurns: boolean,
  ): Promise<ThreadReadResult> {
    this.#assertInitialized();
    return this.#transport.sendRequest<ThreadReadParams, ThreadReadResult>(
      'thread/read',
      {
        threadId,
        includeTurns,
      },
    );
  }

  #assertInitialized(): void {
    if (!this.#initialized) {
      throw new Error('App-server client must be initialized before use');
    }
  }
}
