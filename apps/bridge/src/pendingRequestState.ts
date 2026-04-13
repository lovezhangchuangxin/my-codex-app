import type { JsonRpcRequestId, PendingRequest } from '@my-codex-app/protocol';

export class PendingRequestState {
  readonly #requestsByThreadId = new Map<string, PendingRequest[]>();
  readonly #requestsByRequestId = new Map<string, PendingRequest>();

  listForThread(threadId: string): PendingRequest[] {
    const requests = this.#requestsByThreadId.get(threadId) ?? [];
    return requests.map((request) => ({ ...request }));
  }

  get(requestId: JsonRpcRequestId): PendingRequest | null {
    const request = this.#requestsByRequestId.get(toRequestKey(requestId));
    return request ? { ...request } : null;
  }

  upsert(request: PendingRequest): void {
    const key = toRequestKey(request.requestId);
    const previous = this.#requestsByRequestId.get(key);
    if (previous) {
      const previousThreadRequests =
        this.#requestsByThreadId.get(previous.threadId) ?? [];
      this.#requestsByThreadId.set(
        previous.threadId,
        previousThreadRequests.filter(
          (entry) => toRequestKey(entry.requestId) !== key,
        ),
      );
    }

    this.#requestsByRequestId.set(key, request);
    const nextThreadRequests =
      this.#requestsByThreadId.get(request.threadId) ?? [];
    const deduped = nextThreadRequests.filter(
      (entry) => toRequestKey(entry.requestId) !== key,
    );
    this.#requestsByThreadId.set(
      request.threadId,
      [...deduped, request].sort(
        (left, right) => left.requestedAt - right.requestedAt,
      ),
    );
  }

  resolve(requestId: JsonRpcRequestId): PendingRequest | null {
    const key = toRequestKey(requestId);
    const request = this.#requestsByRequestId.get(key);
    if (!request) {
      return null;
    }

    this.#requestsByRequestId.delete(key);
    const currentThreadRequests =
      this.#requestsByThreadId.get(request.threadId) ?? [];
    const nextThreadRequests = currentThreadRequests.filter(
      (entry) => toRequestKey(entry.requestId) !== key,
    );
    if (nextThreadRequests.length === 0) {
      this.#requestsByThreadId.delete(request.threadId);
    } else {
      this.#requestsByThreadId.set(request.threadId, nextThreadRequests);
    }

    return { ...request };
  }

  clearThread(threadId: string): void {
    const requests = this.#requestsByThreadId.get(threadId) ?? [];
    for (const request of requests) {
      this.#requestsByRequestId.delete(toRequestKey(request.requestId));
    }
    this.#requestsByThreadId.delete(threadId);
  }
}

function toRequestKey(requestId: JsonRpcRequestId): string {
  return typeof requestId === 'string'
    ? `string:${requestId}`
    : `number:${requestId}`;
}
