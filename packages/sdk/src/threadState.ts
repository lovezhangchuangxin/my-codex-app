import type {
  BridgeEvent,
  JsonRpcRequestId,
  LocalConnectionState,
  PendingRequest,
  ThreadDetail,
  ThreadItem,
  ThreadRuntimeStatus,
  ThreadSummary,
  TurnDetail,
  UserInput,
} from '@my-codex-app/protocol';

export type ThreadListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; threads: ThreadSummary[] }
  | { kind: 'error'; message: string };

export type ThreadDetailState =
  | { kind: 'idle' }
  | { kind: 'loading'; threadId: string }
  | { kind: 'ready'; thread: ThreadDetail }
  | { kind: 'error'; threadId: string; message: string };

export interface PendingMessage {
  text: string;
  settings?: import('@my-codex-app/protocol').ThreadTurnSettingsOverrides;
}

export interface ThreadMutationState {
  startThreadPending: boolean;
  sendMessagePending: boolean;
  interruptPending: boolean;
  compactingThreadIds: string[];
  respondingRequestIds: JsonRpcRequestId[];
  lastError: string | null;
  pendingMessages: Map<string, PendingMessage[]>;
}

export interface ThreadRuntimeSnapshot {
  connection: LocalConnectionState;
  threads: ThreadListState;
  detail: ThreadDetailState;
  selectedThreadId: string | null;
  mutations: ThreadMutationState;
}

export function createInitialSnapshot(
  hasCredentials = false,
): ThreadRuntimeSnapshot {
  return {
    connection: hasCredentials
      ? { kind: 'disconnected' }
      : { kind: 'unpaired' },
    threads: hasCredentials ? { kind: 'loading' } : { kind: 'idle' },
    detail: { kind: 'idle' },
    selectedThreadId: null,
    mutations: {
      startThreadPending: false,
      sendMessagePending: false,
      interruptPending: false,
      compactingThreadIds: [],
      respondingRequestIds: [],
      lastError: null,
      pendingMessages: new Map(),
    },
  };
}

export function toThreadDetail(thread: ThreadSummary): ThreadDetail {
  return {
    ...thread,
    turns: [],
    settings: null,
    contextUsage: null,
  };
}

export function toThreadSummary(thread: ThreadDetail): ThreadSummary {
  return {
    id: thread.id,
    preview: thread.preview,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    cwd: thread.cwd,
    modelProvider: thread.modelProvider,
    status: thread.status,
    pendingRequests: thread.pendingRequests,
    ...(thread.name !== undefined ? { name: thread.name } : {}),
  };
}

export function upsertThreadSummary(
  threads: ThreadSummary[],
  nextThread: ThreadSummary,
): ThreadSummary[] {
  const found = threads.some((thread) => thread.id === nextThread.id);
  const nextThreads = found
    ? threads.map((thread) =>
        thread.id === nextThread.id ? nextThread : thread,
      )
    : [...threads, nextThread];

  return sortThreads(nextThreads);
}

export function updateThreadSummaryState(
  state: ThreadListState,
  event: BridgeEvent,
): ThreadListState {
  if (state.kind !== 'ready') {
    return state;
  }

  switch (event.type) {
    case 'threadStarted':
      return {
        kind: 'ready',
        threads: upsertThreadSummary(state.threads, event.thread),
      };
    case 'threadStatusChanged':
      return {
        kind: 'ready',
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === event.threadId
              ? { ...thread, status: event.status }
              : thread,
          ),
        ),
      };
    case 'threadNameUpdated':
      return {
        kind: 'ready',
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === event.threadId
              ? applyThreadName(thread, event.threadName)
              : thread,
          ),
        ),
      };
    case 'turnStarted':
      return {
        kind: 'ready',
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === event.threadId
              ? {
                  ...thread,
                  status: toActiveStatus(thread.status),
                  updatedAt: event.turn.startedAt ?? thread.updatedAt,
                }
              : thread,
          ),
        ),
      };
    case 'itemStarted':
    case 'itemCompleted':
      if (event.item.type !== 'userMessage') {
        return state;
      }

      const userMessage = event.item;

      return {
        kind: 'ready',
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === event.threadId
              ? {
                  ...thread,
                  preview:
                    previewFromUserInput(userMessage.content) ?? thread.preview,
                  updatedAt: nowInSeconds(),
                }
              : thread,
          ),
        ),
      };
    case 'turnError':
    case 'turnCompleted':
    case 'agentMessageDelta':
    case 'reasoningSummaryPartAdded':
    case 'reasoningSummaryTextDelta':
    case 'reasoningTextDelta':
      return state;
    case 'pendingRequestAdded':
      return {
        kind: 'ready',
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === event.threadId
              ? {
                  ...thread,
                  pendingRequests: upsertPendingRequest(
                    thread.pendingRequests,
                    event.request,
                  ),
                }
              : thread,
          ),
        ),
      };
    case 'pendingRequestResolved':
      return {
        kind: 'ready',
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === event.threadId
              ? {
                  ...thread,
                  pendingRequests: removePendingRequest(
                    thread.pendingRequests,
                    event.requestId,
                  ),
                }
              : thread,
          ),
        ),
      };
    case 'threadSettingsUpdated':
    case 'threadContextUsageUpdated':
      return state;
    case 'threadDeleted':
      return {
        kind: 'ready',
        threads: state.threads.filter((t) => t.id !== event.threadId),
      };
  }
}

export function applyThreadEvent(
  thread: ThreadDetail,
  event: BridgeEvent,
): ThreadDetail {
  switch (event.type) {
    case 'threadStarted':
      return thread;
    case 'threadDeleted':
      return thread;
    case 'threadStatusChanged':
      return {
        ...thread,
        status: event.status,
      };
    case 'threadNameUpdated':
      return applyThreadName(thread, event.threadName);
    case 'turnStarted':
      return {
        ...thread,
        status: toActiveStatus(thread.status),
        updatedAt: event.turn.startedAt ?? thread.updatedAt,
        turns: upsertTurn(thread.turns, event.turn),
      };
    case 'turnCompleted':
      return {
        ...thread,
        updatedAt: event.turn.completedAt ?? thread.updatedAt,
        turns: upsertTurn(thread.turns, event.turn),
      };
    case 'turnError':
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? {
                ...turn,
                error: event.error,
                status: event.willRetry ? 'inProgress' : 'failed',
              }
            : turn,
        ),
      };
    case 'itemStarted':
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? { ...turn, items: upsertItem(turn.items, event.item) }
            : turn,
        ),
      };
    case 'itemCompleted':
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? { ...turn, items: upsertItem(turn.items, event.item) }
            : turn,
        ),
      };
    case 'agentMessageDelta':
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? {
                ...turn,
                items: appendAgentMessageDelta(
                  turn.items,
                  event.itemId,
                  event.delta,
                ),
              }
            : turn,
        ),
      };
    case 'reasoningSummaryPartAdded':
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? {
                ...turn,
                items: applyReasoningSummaryPartAdded(
                  turn.items,
                  event.itemId,
                  event.summaryIndex,
                ),
              }
            : turn,
        ),
      };
    case 'reasoningSummaryTextDelta':
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? {
                ...turn,
                items: appendReasoningSummaryDelta(
                  turn.items,
                  event.itemId,
                  event.summaryIndex,
                  event.delta,
                ),
              }
            : turn,
        ),
      };
    case 'reasoningTextDelta':
      return {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === event.turnId
            ? {
                ...turn,
                items: appendReasoningContentDelta(
                  turn.items,
                  event.itemId,
                  event.contentIndex,
                  event.delta,
                ),
              }
            : turn,
        ),
      };
    case 'pendingRequestAdded':
      return {
        ...thread,
        pendingRequests: upsertPendingRequest(
          thread.pendingRequests,
          event.request,
        ),
      };
    case 'pendingRequestResolved':
      return {
        ...thread,
        pendingRequests: removePendingRequest(
          thread.pendingRequests,
          event.requestId,
        ),
      };
    case 'threadSettingsUpdated':
      return {
        ...thread,
        settings: event.settings,
      };
    case 'threadContextUsageUpdated':
      return {
        ...thread,
        contextUsage: event.contextUsage,
      };
  }
}

export function previewFromUserInput(inputs: UserInput[]): string | null {
  for (const input of inputs) {
    if (input.type === 'text' && input.text.trim().length > 0) {
      return input.text.trim();
    }
  }

  return null;
}

export function findActiveTurnId(thread: ThreadDetail): string | null {
  const activeTurn = [...thread.turns]
    .reverse()
    .find((turn) => turn.status === 'inProgress');
  return activeTurn?.id ?? null;
}

export function setThreadMessagePending(
  threads: ThreadSummary[],
  threadId: string,
  input: UserInput[],
): ThreadSummary[] {
  const nextPreview = previewFromUserInput(input);

  return sortThreads(
    threads.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            preview: nextPreview ?? thread.preview,
            status: toActiveStatus(thread.status),
            updatedAt: nowInSeconds(),
          }
        : thread,
    ),
  );
}

function appendAgentMessageDelta(
  items: ThreadItem[],
  itemId: string,
  delta: string,
): ThreadItem[] {
  const found = items.some(
    (item) => item.type === 'agentMessage' && item.id === itemId,
  );
  if (!found) {
    return [...items, { type: 'agentMessage', id: itemId, text: delta }];
  }

  return items.map((item) =>
    item.type === 'agentMessage' && item.id === itemId
      ? { ...item, text: `${item.text}${delta}` }
      : item,
  );
}

function applyReasoningSummaryPartAdded(
  items: ThreadItem[],
  itemId: string,
  summaryIndex: number,
): ThreadItem[] {
  return upsertReasoningItem(items, itemId, (item) => ({
    ...item,
    summary: ensureReasoningSlot(item.summary, summaryIndex),
  }));
}

function appendReasoningSummaryDelta(
  items: ThreadItem[],
  itemId: string,
  summaryIndex: number,
  delta: string,
): ThreadItem[] {
  return upsertReasoningItem(items, itemId, (item) => ({
    ...item,
    summary: appendReasoningDelta(item.summary, summaryIndex, delta),
  }));
}

function appendReasoningContentDelta(
  items: ThreadItem[],
  itemId: string,
  contentIndex: number,
  delta: string,
): ThreadItem[] {
  return upsertReasoningItem(items, itemId, (item) => ({
    ...item,
    content: appendReasoningDelta(item.content, contentIndex, delta),
  }));
}

function upsertReasoningItem(
  items: ThreadItem[],
  itemId: string,
  updater: (
    item: Extract<ThreadItem, { type: 'reasoning' }>,
  ) => Extract<ThreadItem, { type: 'reasoning' }>,
): ThreadItem[] {
  const existingIndex = items.findIndex(
    (item) => item.type === 'reasoning' && item.id === itemId,
  );

  if (existingIndex === -1) {
    return [...items, updater(createReasoningItem(itemId))];
  }

  const existing = items[existingIndex];
  if (!existing || existing.type !== 'reasoning') {
    return items;
  }

  const nextItems = [...items];
  nextItems[existingIndex] = updater(existing);
  return nextItems;
}

function createReasoningItem(
  itemId: string,
): Extract<ThreadItem, { type: 'reasoning' }> {
  return {
    type: 'reasoning',
    id: itemId,
    summary: [],
    content: [],
  };
}

function ensureReasoningSlot(chunks: string[], index: number): string[] {
  const normalizedIndex = normalizeReasoningIndex(index);
  if (normalizedIndex === null) {
    return chunks;
  }

  const next = [...chunks];
  while (next.length <= normalizedIndex) {
    next.push('');
  }
  return next;
}

function appendReasoningDelta(
  chunks: string[],
  index: number,
  delta: string,
): string[] {
  if (delta.length === 0) {
    return chunks;
  }

  const normalizedIndex = normalizeReasoningIndex(index);
  if (normalizedIndex === null) {
    return chunks;
  }

  const next = ensureReasoningSlot(chunks, normalizedIndex);
  const currentChunk = next[normalizedIndex] ?? '';
  if (currentChunk.endsWith(delta)) {
    return next;
  }
  next[normalizedIndex] = `${currentChunk}${delta}`;
  return next;
}

function normalizeReasoningIndex(index: number): number | null {
  if (!Number.isSafeInteger(index) || index < 0) {
    return null;
  }

  return index;
}

function applyThreadName<T extends { name?: string }>(
  thread: T,
  threadName: string | null,
): T {
  const { name: _currentName, ...rest } = thread;
  if (threadName === null) {
    return rest as T;
  }

  return {
    ...rest,
    name: threadName,
  } as T;
}

function sortThreads(threads: ThreadSummary[]): ThreadSummary[] {
  return [...threads].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return right.createdAt - left.createdAt;
  });
}

function upsertTurn(
  turns: ThreadDetail['turns'],
  nextTurn: TurnDetail,
): ThreadDetail['turns'] {
  const found = turns.some((turn) => turn.id === nextTurn.id);
  if (!found) {
    return [...turns, nextTurn];
  }

  return turns.map((turn) =>
    turn.id === nextTurn.id
      ? {
          ...turn,
          ...nextTurn,
          items: nextTurn.items.length > 0 ? nextTurn.items : turn.items,
          ...((nextTurn.error ?? turn.error)
            ? { error: (nextTurn.error ?? turn.error)! }
            : {}),
        }
      : turn,
  );
}

function upsertItem(items: ThreadItem[], nextItem: ThreadItem): ThreadItem[] {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);
  if (existingIndex === -1) {
    return [...items, nextItem];
  }

  const existingItem = items[existingIndex];
  const mergedItem = mergeThreadItem(existingItem, nextItem);
  if (!mergedItem) {
    return items;
  }

  const nextItems = [...items];
  nextItems[existingIndex] = mergedItem;
  return nextItems;
}

function mergeThreadItem(
  existingItem: ThreadItem | undefined,
  nextItem: ThreadItem,
): ThreadItem | null {
  if (!existingItem) {
    return nextItem;
  }

  if (existingItem.type !== 'reasoning' || nextItem.type !== 'reasoning') {
    return nextItem;
  }

  return {
    ...nextItem,
    summary:
      nextItem.summary.length > 0 ? nextItem.summary : existingItem.summary,
    content:
      nextItem.content.length > 0 ? nextItem.content : existingItem.content,
  };
}

function toActiveStatus(current: ThreadRuntimeStatus): ThreadRuntimeStatus {
  if (current.type === 'active') {
    return current;
  }

  return { type: 'active', activeFlags: [] };
}

function upsertPendingRequest(
  pendingRequests: PendingRequest[],
  nextRequest: PendingRequest,
): PendingRequest[] {
  const nextKey = toRequestKey(nextRequest.requestId);
  const remaining = pendingRequests.filter(
    (request) => toRequestKey(request.requestId) !== nextKey,
  );
  return [...remaining, nextRequest].sort(
    (left, right) => left.requestedAt - right.requestedAt,
  );
}

function removePendingRequest(
  pendingRequests: PendingRequest[],
  requestId: JsonRpcRequestId,
): PendingRequest[] {
  const requestKey = toRequestKey(requestId);
  return pendingRequests.filter(
    (request) => toRequestKey(request.requestId) !== requestKey,
  );
}

function toRequestKey(requestId: JsonRpcRequestId): string {
  return typeof requestId === 'string'
    ? `string:${requestId}`
    : `number:${requestId}`;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
