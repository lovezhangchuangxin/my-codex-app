import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FSWatcher } from 'chokidar';
import { watch } from 'chokidar';
import type { BridgeEvent, ThreadSummary } from '@my-codex-app/protocol';

import type { ThreadService } from '../threadService.js';
import { inferThreadStatus } from '../threads/rolloutStatusInference.js';

export class ThreadChangeDetector {
  readonly #threadService: ThreadService;
  readonly #codexHome: string;
  readonly #onEvent: (event: BridgeEvent) => void;
  #watcher: FSWatcher | null = null;
  #cache = new Map<string, ThreadSummary>();
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;
  #processing = false;
  #starting = false;
  #closing = false;
  static readonly DEBOUNCE_MS = 500;
  static readonly ENRICH_CONCURRENCY = 5;

  constructor(
    threadService: ThreadService,
    codexHome: string,
    onEvent: (event: BridgeEvent) => void,
  ) {
    this.#threadService = threadService;
    this.#codexHome = codexHome;
    this.#onEvent = onEvent;
  }

  async start(): Promise<void> {
    this.#starting = true;

    const sessionsDir = join(this.#codexHome, 'sessions');
    if (!existsSync(sessionsDir)) {
      this.#starting = false;
      return;
    }

    // Create watcher FIRST so file events are queued during the async gap.
    this.#watcher = watch(sessionsDir, {
      ignoreInitial: true,
      ignored: (path: string) =>
        !path.endsWith('.jsonl') && !path.includes('sessions'),
    });

    this.#watcher.on('add', this.#scheduleHandleChange);
    this.#watcher.on('change', this.#scheduleHandleChange);
    this.#watcher.on('unlink', this.#scheduleHandleChange);
    this.#watcher.on('error', (error: unknown) => {
      console.error('[ThreadChangeDetector] watcher error:', error);
    });

    // Populate cache baseline — no events emitted.
    try {
      const response = await this.#threadService.listThreads({});
      for (const thread of response.data) {
        this.#cache.set(thread.id, thread);
      }
    } catch (error) {
      console.error(
        '[ThreadChangeDetector] Failed to populate initial cache:',
        error,
      );
    }

    // Run a post-startup diff to catch any changes that occurred during the
    // async gap while the watcher was active but debounce was suppressed.
    this.#starting = false;
    this.#scheduleHandleChange();
  }

  async close(): Promise<void> {
    this.#closing = true;
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    if (this.#watcher) {
      await this.#watcher.close();
      this.#watcher = null;
    }
    this.#cache.clear();
  }

  readonly #scheduleHandleChange = (): void => {
    if (this.#closing || this.#starting || this.#processing) {
      return;
    }
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
    }
    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null;
      this.#processing = true;
      void this.#handleChange().finally(() => {
        this.#processing = false;
      });
    }, ThreadChangeDetector.DEBOUNCE_MS);
  };

  async #handleChange(): Promise<void> {
    if (this.#closing) {
      return;
    }

    let threads: ThreadSummary[];
    try {
      const response = await this.#threadService.listThreads({});
      threads = response.data;
    } catch (error) {
      console.error('[ThreadChangeDetector] Failed to list threads:', error);
      return;
    }

    if (this.#closing) {
      return;
    }

    const newMap = new Map<string, ThreadSummary>();
    for (const thread of threads) {
      newMap.set(thread.id, thread);
    }

    // Enrich notLoaded threads with status inferred from rollout file tails.
    // The app-server returns notLoaded for threads not subscribed via resumeThread,
    // but we can determine the actual status by reading the last lifecycle event.
    // Threads with active per-thread subscribers are automatically excluded —
    // after resumeThread loads them, listThreads returns real status, not notLoaded.
    const notLoadedEntries = Array.from(newMap.entries()).filter(
      ([, thread]) => thread.status.type === 'notLoaded',
    );
    for (
      let i = 0;
      i < notLoadedEntries.length;
      i += ThreadChangeDetector.ENRICH_CONCURRENCY
    ) {
      const batch = notLoadedEntries.slice(
        i,
        i + ThreadChangeDetector.ENRICH_CONCURRENCY,
      );
      await Promise.all(
        batch.map(async ([id, thread]) => {
          if (this.#closing) return;
          try {
            const inferred = await inferThreadStatus(this.#codexHome, id);
            if (inferred) {
              newMap.set(id, { ...thread, status: inferred });
            }
          } catch (error) {
            console.debug(
              '[ThreadChangeDetector] Failed to infer status for',
              id,
              error,
            );
          }
        }),
      );
    }

    // Diff: detect new and changed threads.
    for (const [id, newThread] of newMap) {
      const cached = this.#cache.get(id);
      if (!cached) {
        // New thread.
        this.#onEvent({
          type: 'threadStarted',
          threadId: id,
          thread: newThread,
        });
      } else {
        if (newThread.status.type !== cached.status.type) {
          this.#onEvent({
            type: 'threadStatusChanged',
            threadId: id,
            status: newThread.status,
          });
        }
        if (newThread.name !== cached.name) {
          this.#onEvent({
            type: 'threadNameUpdated',
            threadId: id,
            threadName: newThread.name ?? null,
          });
        }
        if (
          newThread.updatedAt !== cached.updatedAt &&
          newThread.status.type === cached.status.type &&
          newThread.name === cached.name
        ) {
          // updatedAt changed but status/name same — emit for recency/sorting.
          this.#onEvent({
            type: 'threadStatusChanged',
            threadId: id,
            status: newThread.status,
          });
        }
      }
    }

    // Diff: detect deleted threads.
    for (const id of this.#cache.keys()) {
      if (!newMap.has(id)) {
        this.#onEvent({ type: 'threadDeleted', threadId: id });
      }
    }

    this.#cache = newMap;
  }
}
