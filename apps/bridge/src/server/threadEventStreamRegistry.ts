import type { ServerResponse } from "node:http";

import type { BridgeEvent } from "@my-codex-app/protocol";

import { ThreadService } from "../threadService";

type EventClient = {
  response: ServerResponse;
  threadId: string;
};

export class ThreadEventStreamRegistry {
  readonly #eventClients = new Set<EventClient>();
  readonly #threadSubscriberCounts = new Map<string, number>();
  readonly #threadUnsubscribeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #closing = false;

  constructor(
    private readonly threadService: ThreadService,
    private readonly threadUnsubscribeGraceMs: number
  ) {}

  broadcast(event: BridgeEvent): void {
    if (this.#closing) {
      return;
    }

    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.#eventClients) {
      if (client.threadId === event.threadId) {
        client.response.write(frame);
      }
    }
  }

  async addClient(response: ServerResponse, threadId: string): Promise<EventClient> {
    if (this.#closing) {
      throw new Error("Event stream registry is closing");
    }

    const client = { response, threadId };
    this.#eventClients.add(client);

    const subscriberCount = this.#threadSubscriberCounts.get(threadId) ?? 0;
    const hadPendingUnsubscribe = this.#cancelScheduledThreadUnsubscribe(threadId);
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

  close(): void {
    this.#closing = true;
    for (const timer of this.#threadUnsubscribeTimers.values()) {
      clearTimeout(timer);
    }
    this.#threadUnsubscribeTimers.clear();
    for (const client of this.#eventClients) {
      client.response.end();
    }
    this.#eventClients.clear();
    this.#threadSubscriberCounts.clear();
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
    const timer = setTimeout(() => {
      this.#threadUnsubscribeTimers.delete(threadId);
      if ((this.#threadSubscriberCounts.get(threadId) ?? 0) > 0) {
        return;
      }

      this.#threadSubscriberCounts.delete(threadId);
      void this.threadService.unsubscribeThread(threadId).catch(() => {
        // Ignore delayed cleanup errors; the bridge remains authoritative on reconnect.
      });
    }, Math.max(this.threadUnsubscribeGraceMs, 0));
    this.#threadUnsubscribeTimers.set(threadId, timer);
  }
}
