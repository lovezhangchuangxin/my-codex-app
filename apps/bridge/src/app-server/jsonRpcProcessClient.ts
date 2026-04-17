import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

import type {
  JsonRpcFailure,
  JsonRpcRequest,
  JsonRpcSuccess,
  NotificationEnvelope,
  RequestEnvelope,
} from './types.js';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class JsonRpcProcessClient extends EventEmitter {
  #child: ChildProcessWithoutNullStreams;
  #lineReader: ReturnType<typeof createInterface>;
  #nextRequestId = 1;
  #pendingRequests = new Map<number, PendingRequest>();

  constructor(
    private readonly command = 'codex',
    private readonly args = ['app-server'],
  ) {
    super();
    this.#child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#lineReader = createInterface({ input: this.#child.stdout });
    this.#lineReader.on('line', (line) => {
      this.#handleLine(line);
    });
    this.#child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (text.length > 0) {
        console.error(`[app-server] ${text}`);
      }
    });
    this.#child.on('exit', (code, signal) => {
      const reason = new Error(
        `codex app-server exited before request completed (code=${code ?? 'null'} signal=${signal ?? 'null'})`,
      );
      for (const pending of this.#pendingRequests.values()) {
        pending.reject(reason);
      }
      this.#pendingRequests.clear();
    });
  }

  async sendRequest<TParams, TResult>(
    method: string,
    params: TParams,
  ): Promise<TResult> {
    const id = this.#nextRequestId++;
    const request: JsonRpcRequest<TParams> = { id, method, params };
    const promise = new Promise<TResult>((resolve, reject) => {
      this.#pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
      });
    });
    this.#write(request as unknown as Record<string, unknown>);
    return promise;
  }

  sendResponse(id: number | string, result: unknown): void {
    this.#write({
      id,
      result,
    });
  }

  sendNotification(method: string, params: Record<string, unknown>): void {
    this.#write({
      method,
      params,
    });
  }

  async close(): Promise<void> {
    this.#child.stdin.end();
    this.#lineReader.close();

    const exitedGracefully = await waitForExit(this.#child, 500);
    if (!exitedGracefully && !this.#child.killed) {
      this.#child.kill('SIGTERM');
      await once(this.#child, 'exit');
    }
  }

  #write(payload: Record<string, unknown>): void {
    const message = { jsonrpc: '2.0', ...payload };
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line: string): void {
    if (line.trim().length === 0) {
      return;
    }

    const payload = JSON.parse(line) as Partial<
      JsonRpcSuccess<unknown> & JsonRpcFailure
    > & {
      method?: string;
    };

    if (payload.method) {
      if (
        'id' in payload &&
        (typeof payload.id === 'number' || typeof payload.id === 'string')
      ) {
        this.emit('request', payload as RequestEnvelope);
        return;
      }

      this.emit('notification', payload as NotificationEnvelope);
      return;
    }

    if (typeof payload.id !== 'number') {
      return;
    }

    const pending = this.#pendingRequests.get(payload.id);
    if (!pending) {
      return;
    }

    this.#pendingRequests.delete(payload.id);

    if ('error' in payload && payload.error) {
      pending.reject(new Error(payload.error.message));
      return;
    }

    pending.resolve(payload.result);
  }
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onExit = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
    };

    child.on('exit', onExit);
  });
}
