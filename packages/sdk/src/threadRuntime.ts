import type {
  BridgeAuthErrorCode,
  BridgeEvent,
  JsonRpcRequestId,
  LocalConnectionState,
  RequestRespondRequest,
  ThreadReviewRequest,
  ThreadReviewResponse,
  ThreadDetail,
  ThreadRenameResponse,
  ThreadSettings,
  ThreadStartRequest,
  ThreadSummary,
  ThreadTurnSettingsOverrides,
  TurnDetail,
  UserInput,
} from '@my-codex-app/protocol';

import { BridgeClient, BridgeClientError } from './bridgeClient';
import {
  applyThreadEvent,
  createInitialSnapshot,
  setThreadMessagePending,
  toThreadDetail,
  toThreadSummary,
  type ThreadDetailState,
  type ThreadRuntimeSnapshot,
  updateThreadSummaryState,
  upsertThreadSummary,
} from './threadState';

type Listener = () => void;
type ResyncReason = 'startup' | 'manual' | 'reconnect';
type BridgeFailureClassification =
  | LocalConnectionState
  | {
      kind: 'requestError';
      message: string;
    };

const MAX_RECONNECT_ATTEMPTS = 5;

export class BridgeThreadRuntime {
  readonly #listeners = new Set<Listener>();
  readonly #pendingEvents = new Map<string, BridgeEvent[]>();
  #disposed = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #resyncPromise: Promise<void> | null = null;
  #snapshot: ThreadRuntimeSnapshot;
  #unsubscribeEvents: (() => void) | null = null;
  readonly #unsubscribeSessionEvents: () => void;

  constructor(private readonly client: BridgeClient) {
    this.#snapshot = createInitialSnapshot(this.client.hasCredentials());
    this.#unsubscribeSessionEvents = this.client.subscribeToSessionEvents(
      (event) => {
        if (this.#disposed) {
          return;
        }

        switch (event.type) {
          case 'refreshing':
            if (isTerminalConnectionState(this.#snapshot.connection.kind)) {
              return;
            }
            this.#setConnectionState({ kind: 'refreshing' });
            return;
          case 'refreshed':
            if (
              this.#resyncPromise === null &&
              !isTerminalConnectionState(this.#snapshot.connection.kind) &&
              this.#snapshot.connection.kind !== 'unpaired'
            ) {
              this.#markAuthenticated();
            }
            return;
          case 'invalidated':
            this.#applySessionLoss(
              classifyTerminalSessionState(event.code, event.message),
            );
            return;
        }
      },
    );
  }

  getSnapshot = (): ThreadRuntimeSnapshot => this.#snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  async bootstrap(): Promise<void> {
    if (!this.client.hasCredentials()) {
      this.#applySessionLoss({ kind: 'unpaired' });
      return;
    }

    await this.resyncFromBridge('startup');
  }

  async loadThreads(): Promise<void> {
    await this.resyncFromBridge('manual');
  }

  async resyncFromBridge(reason: ResyncReason = 'manual'): Promise<void> {
    if (this.#resyncPromise) {
      return this.#resyncPromise;
    }

    const resyncPromise = this.#performResync(reason).finally(() => {
      if (this.#resyncPromise === resyncPromise) {
        this.#resyncPromise = null;
      }
    });

    this.#resyncPromise = resyncPromise;
    return resyncPromise;
  }

  async retryConnection(): Promise<void> {
    if (this.#resyncPromise) {
      return;
    }

    if (!this.client.hasCredentials()) {
      this.#applySessionLoss({ kind: 'unpaired' });
      return;
    }

    if (isTerminalConnectionState(this.#snapshot.connection.kind)) {
      return;
    }

    this.#setConnectionState({ kind: 'reconnecting' });
    await this.resyncFromBridge('reconnect');
  }

  async selectThread(threadId: string | null): Promise<void> {
    if (threadId === this.#snapshot.selectedThreadId) {
      return;
    }

    this.#disconnectEvents();

    if (!threadId) {
      this.#pendingEvents.clear();
      this.#update((current) => ({
        ...current,
        selectedThreadId: null,
        detail: { kind: 'idle' },
      }));
      return;
    }

    this.#pendingEvents.set(threadId, []);
    this.#update((current) => ({
      ...current,
      selectedThreadId: threadId,
      detail: { kind: 'loading', threadId },
    }));

    if (this.#snapshot.connection.kind !== 'authenticated') {
      return;
    }

    await this.#loadSelectedThread(threadId);
  }

  async startThread(request: ThreadStartRequest = {}): Promise<string> {
    this.#updateMutations({ startThreadPending: true, lastError: null });

    try {
      const response = await this.client.startThread(request);
      const thread = response.thread;
      this.#update((current) => ({
        ...current,
        threads:
          current.threads.kind === 'ready'
            ? {
                kind: 'ready',
                threads: upsertThreadSummary(
                  current.threads.threads,
                  toThreadSummary(thread),
                ),
              }
            : {
                kind: 'ready',
                threads: [toThreadSummary(thread)],
              },
      }));

      this.#showSelectedThread(thread);
      return thread.id;
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#updateMutations({ startThreadPending: false });
    }
  }

  async renameThread(
    threadId: string,
    name: string,
  ): Promise<ThreadRenameResponse> {
    this.#updateMutations({ lastError: null });

    try {
      const response = await this.client.renameThread({ threadId, name });
      const event: BridgeEvent = {
        type: 'threadNameUpdated',
        threadId,
        threadName: name,
      };
      this.#update((current) => ({
        ...current,
        threads: updateThreadSummaryState(current.threads, event),
        detail: this.#applyEventToDetail(
          current.detail,
          current.selectedThreadId,
          event,
        ),
      }));
      return response;
    } catch (error) {
      this.#setActionError(error);
      throw error;
    }
  }

  async sendMessage(
    threadId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides,
  ): Promise<void> {
    if (this.#isThreadCompactingPending(threadId)) {
      throw new Error(
        'Thread compaction is starting. Wait before sending another message.',
      );
    }

    const nextText = text.trim();
    if (nextText.length === 0) {
      return;
    }

    const input: UserInput[] = [{ type: 'text', text: nextText }];
    this.#updateMutations({ sendMessagePending: true, lastError: null });

    try {
      const response = await this.client.startTurn({
        threadId,
        input,
        ...(settings !== undefined ? { settings } : {}),
      });

      this.#update((current) => ({
        ...current,
        threads:
          current.threads.kind === 'ready'
            ? {
                kind: 'ready',
                threads: setThreadMessagePending(
                  current.threads.threads,
                  threadId,
                  input,
                ),
              }
            : current.threads,
      }));

      this.#applyStartedTurn(threadId, response.turn);
      if (response.settings) {
        this.#applyThreadSettings(threadId, response.settings);
      }
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#updateMutations({ sendMessagePending: false });
    }
  }

  async compactThread(threadId: string): Promise<void> {
    if (this.#isThreadCompactingPending(threadId)) {
      throw new Error('Thread compaction is already pending for this thread.');
    }

    this.#setThreadCompacting(threadId, true);
    this.#updateMutations({ lastError: null });

    try {
      await this.client.compactThread({ threadId });
    } catch (error) {
      this.#setThreadCompacting(threadId, false);
      this.#setActionError(error);
      throw error;
    }
  }

  async startReview(
    request: ThreadReviewRequest,
  ): Promise<ThreadReviewResponse> {
    this.#updateMutations({ lastError: null });

    try {
      const response = await this.client.startReview(request);
      if (response.reviewThreadId === request.threadId) {
        this.#applyStartedTurn(request.threadId, response.turn);
      }
      return response;
    } catch (error) {
      this.#setActionError(error);
      throw error;
    }
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    this.#updateMutations({ interruptPending: true, lastError: null });

    try {
      await this.client.interruptTurn({ threadId, turnId });
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#updateMutations({ interruptPending: false });
    }
  }

  async respondToRequest(request: RequestRespondRequest): Promise<void> {
    this.#setPendingRequestResponse(request.requestId, true);
    this.#updateMutations({ lastError: null });

    try {
      await this.client.respondToRequest(request);
    } catch (error) {
      this.#setActionError(error);
      throw error;
    } finally {
      this.#setPendingRequestResponse(request.requestId, false);
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#clearReconnectTimer();
    this.#disconnectEvents();
    this.#unsubscribeSessionEvents();
    this.#pendingEvents.clear();
  }

  resetState(): void {
    this.#clearReconnectTimer();
    this.#disconnectEvents();
    this.#pendingEvents.clear();
    this.#snapshot = createInitialSnapshot(this.client.hasCredentials());
    for (const listener of this.#listeners) {
      listener();
    }
  }

  async #performResync(reason: ResyncReason): Promise<void> {
    this.#clearReconnectTimer();

    if (!this.client.hasCredentials()) {
      this.#applySessionLoss({ kind: 'unpaired' });
      return;
    }

    try {
      if (this.#credentialsNeedRefresh()) {
        this.#setConnectionState({ kind: 'refreshing' });
        await this.client.refreshSession();
      }

      this.#setConnectionState({ kind: 'resyncing' });
      this.#update((current) => ({
        ...current,
        threads:
          current.threads.kind === 'ready'
            ? current.threads
            : { kind: 'loading' },
        detail:
          current.selectedThreadId && current.detail.kind !== 'ready'
            ? { kind: 'loading', threadId: current.selectedThreadId }
            : current.detail,
      }));

      const response = await this.client.listThreads();
      const selectedThreadId = this.#snapshot.selectedThreadId;

      this.#update((current) => ({
        ...current,
        threads: {
          kind: 'ready',
          threads: response.data,
        },
      }));

      if (!selectedThreadId) {
        this.#disconnectEvents();
        this.#update((current) => ({
          ...current,
          detail: { kind: 'idle' },
        }));
        this.#markAuthenticated();
        return;
      }

      this.#update((current) => ({
        ...current,
        detail:
          current.detail.kind === 'ready' &&
          current.detail.thread.id === selectedThreadId
            ? current.detail
            : { kind: 'loading', threadId: selectedThreadId },
      }));

      const thread = await this.#readThreadDetail(
        selectedThreadId,
        response.data,
      );
      if (this.#snapshot.selectedThreadId !== selectedThreadId) {
        return;
      }

      this.#update((current) => ({
        ...current,
        threads:
          current.threads.kind === 'ready'
            ? {
                kind: 'ready',
                threads: upsertThreadSummary(
                  current.threads.threads,
                  toThreadSummary(thread),
                ),
              }
            : current.threads,
        detail: { kind: 'ready', thread },
      }));
      this.#connectEvents(selectedThreadId);
      this.#markAuthenticated();
    } catch (error) {
      const classification = classifyBridgeFailure(error);
      if (classification.kind === 'requestError') {
        if (this.#snapshot.threads.kind !== 'ready') {
          this.#update((current) => ({
            ...current,
            threads: {
              kind: 'error',
              message: classification.message,
            },
          }));
        }

        if (this.#snapshot.selectedThreadId) {
          this.#update((current) => ({
            ...current,
            detail: {
              kind: 'error',
              threadId: current.selectedThreadId ?? 'unknown',
              message: classification.message,
            },
          }));
        }

        this.#markAuthenticated();
        if (reason === 'manual') {
          throw error;
        }
        return;
      }

      if (classification.kind === 'unpaired') {
        this.#applySessionLoss(
          withOptionalMessage({ kind: 'unpaired' }, classification.message),
        );
        return;
      }

      if (
        classification.kind === 'revoked' ||
        classification.kind === 'expired'
      ) {
        this.#applySessionLoss({
          kind: classification.kind,
          ...(classification.message
            ? { message: classification.message }
            : {}),
          ...(classification.authErrorCode
            ? { authErrorCode: classification.authErrorCode }
            : {}),
        });
        return;
      }

      this.#disconnectEvents();
      this.#setConnectionState({
        kind: 'disconnected',
        ...(classification.message ? { message: classification.message } : {}),
      });
      this.#scheduleReconnect(
        classification.message ?? 'Bridge is disconnected',
      );

      if (this.#snapshot.threads.kind !== 'ready') {
        this.#update((current) => ({
          ...current,
          threads: {
            kind: 'error',
            message: classification.message ?? 'Bridge is disconnected',
          },
        }));
      }

      if (
        this.#snapshot.detail.kind !== 'ready' &&
        this.#snapshot.selectedThreadId
      ) {
        this.#update((current) => ({
          ...current,
          detail: {
            kind: 'error',
            threadId: current.selectedThreadId ?? 'unknown',
            message: classification.message ?? 'Bridge is disconnected',
          },
        }));
      }

      if (reason === 'manual') {
        throw error;
      }
    }
  }

  async #loadSelectedThread(threadId: string): Promise<void> {
    this.#pendingEvents.set(threadId, []);
    this.#connectEvents(threadId);

    try {
      const thread = await this.#readThreadDetail(threadId);
      if (this.#snapshot.selectedThreadId !== threadId) {
        return;
      }

      this.#update((current) => ({
        ...current,
        threads:
          current.threads.kind === 'ready'
            ? {
                kind: 'ready',
                threads: upsertThreadSummary(
                  current.threads.threads,
                  toThreadSummary(thread),
                ),
              }
            : current.threads,
        detail: { kind: 'ready', thread },
      }));
    } catch (error) {
      if (this.#snapshot.selectedThreadId !== threadId) {
        return;
      }

      const classification = classifyBridgeFailure(error);
      if (classification.kind === 'requestError') {
        this.#setActionError(error);
        this.#update((current) => ({
          ...current,
          detail: {
            kind: 'error',
            threadId,
            message: classification.message,
          },
        }));
        return;
      }

      if (
        classification.kind === 'revoked' ||
        classification.kind === 'expired'
      ) {
        this.#applySessionLoss({
          kind: classification.kind,
          ...(classification.message
            ? { message: classification.message }
            : {}),
          ...(classification.authErrorCode
            ? { authErrorCode: classification.authErrorCode }
            : {}),
        });
        return;
      }

      if (classification.kind === 'unpaired') {
        this.#applySessionLoss(
          withOptionalMessage({ kind: 'unpaired' }, classification.message),
        );
        return;
      }

      this.#setConnectionState({
        kind: 'reconnecting',
        ...(classification.message ? { message: classification.message } : {}),
      });
      this.#scheduleReconnect(
        classification.message ?? 'Bridge event stream disconnected',
      );
    }
  }

  async #readThreadDetail(
    threadId: string,
    fallbackThreads?: ThreadSummary[],
  ): Promise<ThreadDetail> {
    try {
      const response = await this.client.readThread(threadId);
      return this.#drainPendingEvents(threadId, response.thread);
    } catch (error) {
      const message = toErrorMessage(error);
      if (
        message.includes(
          'includeTurns is unavailable before first user message',
        )
      ) {
        const thread =
          fallbackThreads?.find((entry) => entry.id === threadId) ??
          (await this.#resolveThreadSummary(threadId));
        if (thread) {
          return this.#drainPendingEvents(threadId, toThreadDetail(thread));
        }
      }

      throw error;
    }
  }

  #applyStartedTurn(threadId: string, turn: TurnDetail): void {
    if (this.#snapshot.selectedThreadId !== threadId) {
      return;
    }

    const currentDetail = this.#snapshot.detail;
    if (
      currentDetail.kind === 'ready' &&
      currentDetail.thread.id === threadId
    ) {
      this.#update((current) => ({
        ...current,
        detail: {
          kind: 'ready',
          thread: applyThreadEvent(currentDetail.thread, {
            type: 'turnStarted',
            threadId,
            turn,
          }),
        },
      }));
      return;
    }

    const thread = this.#findThreadSummary(threadId);
    if (!thread) {
      return;
    }

    this.#update((current) => ({
      ...current,
      detail: {
        kind: 'ready',
        thread: applyThreadEvent(toThreadDetail(thread), {
          type: 'turnStarted',
          threadId,
          turn,
        }),
      },
    }));
  }

  #applyThreadSettings(threadId: string, settings: ThreadSettings): void {
    if (this.#snapshot.selectedThreadId !== threadId) {
      return;
    }

    const currentDetail = this.#snapshot.detail;
    if (
      currentDetail.kind !== 'ready' ||
      currentDetail.thread.id !== threadId
    ) {
      return;
    }

    this.#update((current) => ({
      ...(current.detail.kind === 'ready' &&
      current.detail.thread.id === threadId
        ? {
            ...current,
            detail: {
              kind: 'ready' as const,
              thread: {
                ...current.detail.thread,
                settings,
              },
            },
          }
        : current),
    }));
  }

  #connectEvents(threadId: string): void {
    this.#disconnectEvents();
    this.#unsubscribeEvents = this.client.subscribeToThreadEvents(threadId, {
      onEvent: (event) => {
        this.#update((current) => ({
          ...current,
          mutations: clearCompactingThreadOnEvent(current.mutations, event),
          threads: updateThreadSummaryState(current.threads, event),
          detail: this.#applyEventToDetail(
            current.detail,
            current.selectedThreadId,
            event,
          ),
        }));
      },
      onDisconnect: (error) => {
        if (this.#snapshot.selectedThreadId !== threadId) {
          return;
        }

        const classification = classifyBridgeFailure(error);
        if (
          classification.kind === 'revoked' ||
          classification.kind === 'expired'
        ) {
          this.#applySessionLoss({
            kind: classification.kind,
            ...(classification.message
              ? { message: classification.message }
              : {}),
            ...(classification.authErrorCode
              ? { authErrorCode: classification.authErrorCode }
              : {}),
          });
          return;
        }

        if (classification.kind === 'unpaired') {
          this.#applySessionLoss(
            withOptionalMessage({ kind: 'unpaired' }, classification.message),
          );
          return;
        }

        this.#disconnectEvents();
        this.#setConnectionState({
          kind: 'reconnecting',
          ...(classification.message
            ? { message: classification.message }
            : {}),
        });
        this.#scheduleReconnect(
          classification.message ?? 'Bridge event stream disconnected',
        );
      },
    });
  }

  #disconnectEvents(): void {
    this.#unsubscribeEvents?.();
    this.#unsubscribeEvents = null;
  }

  #showSelectedThread(thread: ThreadDetail): void {
    this.#disconnectEvents();
    this.#pendingEvents.set(thread.id, []);
    this.#update((current) => ({
      ...current,
      selectedThreadId: thread.id,
      detail: {
        kind: 'ready',
        thread,
      },
    }));
    this.#connectEvents(thread.id);
  }

  #applyEventToDetail(
    detail: ThreadDetailState,
    selectedThreadId: string | null,
    event: BridgeEvent,
  ): ThreadDetailState {
    if (selectedThreadId !== event.threadId) {
      return detail;
    }

    if (detail.kind !== 'ready') {
      const queued = this.#pendingEvents.get(event.threadId) ?? [];
      this.#pendingEvents.set(event.threadId, [...queued, event]);
      return detail;
    }

    return {
      kind: 'ready',
      thread: applyThreadEvent(detail.thread, event),
    };
  }

  #drainPendingEvents(threadId: string, thread: ThreadDetail): ThreadDetail {
    const queuedEvents = this.#pendingEvents.get(threadId) ?? [];
    this.#pendingEvents.delete(threadId);
    return queuedEvents.reduce(
      (currentThread, event) => applyThreadEvent(currentThread, event),
      thread,
    );
  }

  #findThreadSummary(threadId: string): ThreadSummary | null {
    if (this.#snapshot.threads.kind !== 'ready') {
      return null;
    }

    return (
      this.#snapshot.threads.threads.find((thread) => thread.id === threadId) ??
      null
    );
  }

  async #resolveThreadSummary(threadId: string): Promise<ThreadSummary | null> {
    const existing = this.#findThreadSummary(threadId);
    if (existing) {
      return existing;
    }

    const response = await this.client.listThreads();
    let matchedThread: ThreadSummary | null = null;

    this.#update((current) => {
      matchedThread =
        response.data.find((thread) => thread.id === threadId) ?? null;
      return {
        ...current,
        threads: {
          kind: 'ready',
          threads: response.data,
        },
      };
    });

    return matchedThread;
  }

  #applySessionLoss(nextConnection: LocalConnectionState): void {
    const nextSnapshot = createInitialSnapshot(this.client.hasCredentials());
    this.#clearReconnectTimer();
    this.#disconnectEvents();
    this.#pendingEvents.clear();
    this.#snapshot = {
      ...nextSnapshot,
      connection: withLastSyncedAt(
        nextConnection,
        this.#snapshot.connection.lastSyncedAt,
      ),
    };
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #credentialsNeedRefresh(): boolean {
    const credentials = this.client.getCredentials();
    if (!credentials) {
      return false;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    return credentials.accessTokenExpiresAt <= nowInSeconds + 15;
  }

  #markAuthenticated(): void {
    this.#reconnectAttempt = 0;
    this.#setConnectionState({
      kind: 'authenticated',
      lastSyncedAt: Math.floor(Date.now() / 1000),
    });
  }

  #scheduleReconnect(message: string): void {
    if (
      this.#reconnectTimer ||
      this.#disposed ||
      !this.client.hasCredentials()
    ) {
      return;
    }

    if (this.#reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.#applySessionLoss({
        kind: 'unreachable',
        message: 'Unable to reach bridge. The address may have changed.',
      });
      this.client.clearCredentials();
      return;
    }

    const delay =
      Math.min(1000 * 2 ** this.#reconnectAttempt, 30_000) +
      Math.floor(Math.random() * 1000);
    this.#reconnectAttempt++;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#disposed || !this.client.hasCredentials()) {
        return;
      }

      this.#setConnectionState({
        kind: 'reconnecting',
        message,
      });
      void this.resyncFromBridge('reconnect');
    }, delay);
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  #setConnectionState(nextConnection: LocalConnectionState): void {
    this.#update((current) => ({
      ...current,
      connection: withLastSyncedAt(
        nextConnection,
        current.connection.lastSyncedAt,
      ),
    }));
  }

  #setActionError(error: unknown): void {
    this.#updateMutations({ lastError: toErrorMessage(error) });
  }

  #isThreadCompactingPending(threadId: string): boolean {
    return this.#snapshot.mutations.compactingThreadIds.includes(threadId);
  }

  #setThreadCompacting(threadId: string, isCompacting: boolean): void {
    this.#update((current) => {
      const nextIds = isCompacting
        ? current.mutations.compactingThreadIds.includes(threadId)
          ? current.mutations.compactingThreadIds
          : [...current.mutations.compactingThreadIds, threadId]
        : current.mutations.compactingThreadIds.filter((id) => id !== threadId);

      return {
        ...current,
        mutations: {
          ...current.mutations,
          compactingThreadIds: nextIds,
        },
      };
    });
  }

  #updateMutations(next: Partial<ThreadRuntimeSnapshot['mutations']>): void {
    this.#update((current) => ({
      ...current,
      mutations: {
        ...current.mutations,
        ...next,
      },
    }));
  }

  #setPendingRequestResponse(
    requestId: JsonRpcRequestId,
    isPending: boolean,
  ): void {
    const requestKey = toRequestKey(requestId);
    this.#update((current) => {
      const nextIds = isPending
        ? current.mutations.respondingRequestIds.some(
            (id) => toRequestKey(id) === requestKey,
          )
          ? current.mutations.respondingRequestIds
          : [...current.mutations.respondingRequestIds, requestId]
        : current.mutations.respondingRequestIds.filter(
            (id) => toRequestKey(id) !== requestKey,
          );

      return {
        ...current,
        mutations: {
          ...current.mutations,
          respondingRequestIds: nextIds,
        },
      };
    });
  }

  #update(
    updater: (current: ThreadRuntimeSnapshot) => ThreadRuntimeSnapshot,
  ): void {
    this.#snapshot = updater(this.#snapshot);
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function classifyBridgeFailure(error: unknown): BridgeFailureClassification {
  if (error instanceof BridgeClientError) {
    if (error.kind === 'stream') {
      return {
        kind: 'requestError',
        message: error.message,
      };
    }

    if (
      error.kind === 'http' &&
      error.status !== 401 &&
      error.code === undefined
    ) {
      return {
        kind: 'requestError',
        message: error.message,
      };
    }

    if (
      error.code === 'missingCredentials' ||
      error.kind === 'sessionUnavailable'
    ) {
      return {
        kind: 'unpaired',
        message: error.message,
        ...(error.code ? { authErrorCode: error.code } : {}),
      };
    }

    if (error.code === 'revokedDevice') {
      return {
        kind: 'revoked',
        message: error.message,
        authErrorCode: error.code,
      };
    }

    if (
      error.code === 'invalidRefreshToken' ||
      error.code === 'expiredRefreshToken'
    ) {
      return {
        kind: 'expired',
        message: error.message,
        authErrorCode: error.code,
      };
    }
  }

  return {
    kind: 'disconnected',
    message: toErrorMessage(error),
  };
}

function clearCompactingThreadOnEvent(
  mutations: ThreadRuntimeSnapshot['mutations'],
  event: BridgeEvent,
): ThreadRuntimeSnapshot['mutations'] {
  switch (event.type) {
    case 'turnStarted':
    case 'turnCompleted':
      if (!mutations.compactingThreadIds.includes(event.threadId)) {
        return mutations;
      }
      return {
        ...mutations,
        compactingThreadIds: mutations.compactingThreadIds.filter(
          (threadId) => threadId !== event.threadId,
        ),
      };
    case 'itemStarted':
    case 'itemCompleted':
      if (
        event.item.type !== 'contextCompaction' ||
        !mutations.compactingThreadIds.includes(event.threadId)
      ) {
        return mutations;
      }
      return {
        ...mutations,
        compactingThreadIds: mutations.compactingThreadIds.filter(
          (threadId) => threadId !== event.threadId,
        ),
      };
    default:
      return mutations;
  }
}

function classifyTerminalSessionState(
  code: BridgeAuthErrorCode | undefined,
  message: string,
): LocalConnectionState {
  if (code === 'revokedDevice') {
    return {
      kind: 'revoked',
      message,
      authErrorCode: code,
    };
  }

  if (code === 'invalidRefreshToken' || code === 'expiredRefreshToken') {
    return {
      kind: 'expired',
      message,
      authErrorCode: code,
    };
  }

  return {
    kind: 'unpaired',
    message,
    ...(code ? { authErrorCode: code } : {}),
  };
}

function isTerminalConnectionState(
  kind: LocalConnectionState['kind'],
): boolean {
  return kind === 'revoked' || kind === 'expired' || kind === 'unreachable';
}

function withLastSyncedAt(
  nextConnection: LocalConnectionState,
  lastSyncedAt: number | undefined,
): LocalConnectionState {
  if (nextConnection.lastSyncedAt !== undefined || lastSyncedAt === undefined) {
    return nextConnection;
  }

  return {
    ...nextConnection,
    lastSyncedAt,
  };
}

function withOptionalMessage<T extends { kind: LocalConnectionState['kind'] }>(
  nextConnection: T,
  message: string | undefined,
): T | (T & { message: string }) {
  if (!message) {
    return nextConnection;
  }

  return {
    ...nextConnection,
    message,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof BridgeClientError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'Unknown client error';
}

function toRequestKey(requestId: JsonRpcRequestId): string {
  return typeof requestId === 'string'
    ? `string:${requestId}`
    : `number:${requestId}`;
}
