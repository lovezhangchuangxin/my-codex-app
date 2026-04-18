import type { ServerResponse } from 'node:http';

import type { BridgeEvent } from '@my-codex-app/protocol';

import { ThreadService } from '../threadService.js';
import { ThreadChangeDetector } from './threadChangeDetector.js';

type EventClient = {
  response: ServerResponse;
  threadId: string;
};

export type GlobalEventClient = {
  response: ServerResponse;
};

const GLOBAL_CHANNEL_EVENT_TYPES: ReadonlySet<string> = new Set([
  'threadStarted',
  'threadStatusChanged',
  'threadNameUpdated',
  'threadDeleted',
  'pendingRequestAdded',
  'pendingRequestResolved',
  'turnStarted',
  'turnCompleted',
  'turnError',
]);

export function isGlobalChannelEvent(event: BridgeEvent): boolean {
  switch (event.type) {
    case 'itemStarted':
    case 'itemCompleted':
      return 'item' in event && event.item.type === 'userMessage';
    default:
      return GLOBAL_CHANNEL_EVENT_TYPES.has(event.type);
  }
}

export class ThreadEventStreamRegistry {
  readonly #eventClients = new Set<EventClient>();
  readonly #globalEventClients = new Set<GlobalEventClient>();
  readonly #threadSubscriberCounts = new Map<string, number>();
  readonly #threadUnsubscribeTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  readonly #unloadCheckFailures = new Map<string, number>();
  #threadChangeDetector: ThreadChangeDetector | null = null;
  #detectorInitPromise: Promise<ThreadChangeDetector> | null = null;
  #closing = false;

  static readonly MAX_UNLOAD_CHECK_FAILURES = 10;

  constructor(
    private readonly threadService: ThreadService,
    private readonly threadUnsubscribeGraceMs: number,
    private readonly codexHome: string,
  ) {}

  broadcast(event: BridgeEvent): void {
    if (this.#closing) {
      return;
    }

    const isGlobal = isGlobalChannelEvent(event);
    const frame = `data: ${JSON.stringify(event)}\n\n`;

    const deadThreadClients: EventClient[] = [];
    for (const client of this.#eventClients) {
      if (client.threadId === event.threadId) {
        try {
          client.response.write(frame);
        } catch {
          deadThreadClients.push(client);
        }
      }
    }
    for (const client of deadThreadClients) {
      this.#eventClients.delete(client);
      try {
        client.response.end();
      } catch {
        // Ignore close errors
      }
    }

    if (isGlobal) {
      const deadGlobalClients: GlobalEventClient[] = [];
      for (const client of this.#globalEventClients) {
        try {
          client.response.write(frame);
        } catch {
          deadGlobalClients.push(client);
        }
      }
      for (const client of deadGlobalClients) {
        this.#globalEventClients.delete(client);
        try {
          client.response.end();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  async addClient(
    response: ServerResponse,
    threadId: string,
  ): Promise<EventClient> {
    if (this.#closing) {
      throw new Error('Event stream registry is closing');
    }

    const client = { response, threadId };
    this.#eventClients.add(client);

    const subscriberCount = this.#threadSubscriberCounts.get(threadId) ?? 0;
    const hadPendingUnsubscribe =
      this.#cancelScheduledThreadUnsubscribe(threadId);
    this.#unloadCheckFailures.delete(threadId);
    this.#threadSubscriberCounts.set(threadId, subscriberCount + 1);

    try {
      if (subscriberCount === 0 && !hadPendingUnsubscribe) {
        await this.threadService.resumeThread(threadId);
      }
    } catch (error) {
      this.#eventClients.delete(client);
      if (subscriberCount === 0) {
        this.#threadSubscriberCounts.delete(threadId);
      } else {
        this.#threadSubscriberCounts.set(threadId, subscriberCount);
      }
      throw error;
    }

    return client;
  }

  removeClient(client: EventClient): void {
    if (this.#closing) {
      return;
    }

    this.#eventClients.delete(client);
    const currentCount = this.#threadSubscriberCounts.get(client.threadId) ?? 0;
    if (currentCount <= 1) {
      this.#threadSubscriberCounts.set(client.threadId, 0);
      this.#scheduleThreadUnsubscribe(client.threadId);
      return;
    }

    this.#threadSubscriberCounts.set(client.threadId, currentCount - 1);
  }

  async addGlobalClient(response: ServerResponse): Promise<GlobalEventClient> {
    if (this.#closing) {
      throw new Error('Event stream registry is closing');
    }

    // Ensure detector is initialized (with lock to prevent concurrent init).
    if (!this.#threadChangeDetector && !this.#detectorInitPromise) {
      this.#detectorInitPromise = (async () => {
        const detector = new ThreadChangeDetector(
          this.threadService,
          this.codexHome,
          (event) => this.broadcast(event),
        );
        await detector.start();
        return detector;
      })();
      try {
        this.#threadChangeDetector = await this.#detectorInitPromise;
      } catch (error) {
        this.#threadChangeDetector = null;
        throw error;
      } finally {
        this.#detectorInitPromise = null;
      }
    } else if (this.#detectorInitPromise) {
      this.#threadChangeDetector = await this.#detectorInitPromise;
    }

    const client: GlobalEventClient = { response };
    this.#globalEventClients.add(client);

    return client;
  }

  removeGlobalClient(client: GlobalEventClient): void {
    const removed = this.#globalEventClients.delete(client);
    if (!removed) {
      return;
    }

    if (this.#globalEventClients.size === 0 && this.#threadChangeDetector) {
      void this.#threadChangeDetector.close();
      this.#threadChangeDetector = null;
    }
  }

  close(): void {
    this.#closing = true;
    for (const timer of this.#threadUnsubscribeTimers.values()) {
      clearTimeout(timer);
    }
    this.#threadUnsubscribeTimers.clear();
    this.#detectorInitPromise = null;
    if (this.#threadChangeDetector) {
      void this.#threadChangeDetector.close();
      this.#threadChangeDetector = null;
    }
    for (const client of this.#eventClients) {
      client.response.end();
    }
    this.#eventClients.clear();
    for (const client of this.#globalEventClients) {
      client.response.end();
    }
    this.#globalEventClients.clear();
    this.#threadSubscriberCounts.clear();
    this.#unloadCheckFailures.clear();
  }

  #cancelScheduledThreadUnsubscribe(threadId: string): boolean {
    const timer = this.#threadUnsubscribeTimers.get(threadId);
    if (!timer) {
      return false;
    }

    clearTimeout(timer);
    this.#threadUnsubscribeTimers.delete(threadId);
    return true;
  }

  #scheduleThreadUnsubscribe(threadId: string): void {
    this.#cancelScheduledThreadUnsubscribe(threadId);
    const timer = setTimeout(
      () => {
        void this.#attemptThreadUnsubscribe(threadId);
      },
      Math.max(this.threadUnsubscribeGraceMs, 0),
    );
    this.#threadUnsubscribeTimers.set(threadId, timer);
  }

  async #attemptThreadUnsubscribe(threadId: string): Promise<void> {
    this.#threadUnsubscribeTimers.delete(threadId);
    if ((this.#threadSubscriberCounts.get(threadId) ?? 0) > 0) {
      return;
    }

    let canUnload: boolean;
    try {
      canUnload = await this.threadService.canUnloadThread(threadId);
    } catch {
      const failures = (this.#unloadCheckFailures.get(threadId) ?? 0) + 1;
      if (failures >= ThreadEventStreamRegistry.MAX_UNLOAD_CHECK_FAILURES) {
        canUnload = true;
      } else {
        this.#unloadCheckFailures.set(threadId, failures);
        this.#scheduleThreadUnsubscribe(threadId);
        return;
      }
    }

    if (!canUnload) {
      this.#scheduleThreadUnsubscribe(threadId);
      return;
    }

    this.#unloadCheckFailures.delete(threadId);
    this.#threadSubscriberCounts.delete(threadId);
    await this.threadService.unsubscribeThread(threadId).catch(() => {
      // Ignore delayed cleanup errors; the bridge remains authoritative on reconnect.
    });
  }
}
