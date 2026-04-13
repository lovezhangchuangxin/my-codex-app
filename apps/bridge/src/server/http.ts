import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ApiErrorPayload } from '@my-codex-app/protocol';

import { BridgeAuthError } from '../auth/authService';

export function parseOptionalInt(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

export function writeError(
  response: ServerResponse,
  error: unknown,
  statusCode: number,
): void {
  if (error instanceof BridgeAuthError) {
    writeJson(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    } satisfies ApiErrorPayload);
    return;
  }

  const message =
    error instanceof Error ? error.message : 'Unknown bridge error';
  const customStatusCode = getCustomStatusCode(error);
  if (customStatusCode !== null) {
    writeJson(response, customStatusCode, {
      error: {
        message,
      },
    } satisfies ApiErrorPayload);
    return;
  }

  console.error(`[bridge] Unhandled error (${statusCode}): ${message}`);
  writeJson(response, statusCode, {
    error: { message },
  } satisfies ApiErrorPayload);
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Invalid JSON request body');
  }
}

export function classifyAppServerError(
  error: unknown,
  fallbackStatusCode: number,
): number {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Invalid JSON request body') {
    return 400;
  }

  if (
    message.includes('not materialized yet') ||
    message.includes('includeTurns is unavailable before first user message') ||
    message.includes('thread not loaded') ||
    message.includes('active turn') ||
    message.includes('cannot accept same-turn steering') ||
    message.includes('Unknown or resolved pending request')
  ) {
    return 409;
  }

  if (
    message.includes('missing') ||
    message.includes('invalid') ||
    message.includes('failed to parse') ||
    message.includes('unknown thread') ||
    message.includes('unknown turn')
  ) {
    return 400;
  }

  return fallbackStatusCode;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getCustomStatusCode(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }

  return null;
}
