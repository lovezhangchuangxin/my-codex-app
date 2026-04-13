import type { Dirent } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import ignore, { type Ignore } from 'ignore';
import * as path from 'node:path';

import type {
  WorkspaceEntry,
  WorkspaceReadDirectoryRequest,
  WorkspaceReadDirectoryResponse,
  WorkspaceReadFileRequest,
  WorkspaceReadFileResponse,
  WorkspaceSearchFilesRequest,
  WorkspaceSearchFilesResponse,
} from '@my-codex-app/protocol';

import { AppServerClient } from './appServerClient';

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;
const DEFAULT_WORKSPACE_SEARCH_LIMIT = 12;
const MAX_WORKSPACE_SEARCH_LIMIT = 40;
const MAX_WORKSPACE_SEARCH_ENTRIES = 12_000;
const WORKSPACE_SEARCH_SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  'target',
]);

export class WorkspaceServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class WorkspaceService {
  readonly #workspaceRootByThreadId = new Map<string, string>();

  constructor(private readonly appServerClient: AppServerClient) {}

  async readDirectory(
    request: WorkspaceReadDirectoryRequest,
  ): Promise<WorkspaceReadDirectoryResponse> {
    const normalizedPath = normalizeWorkspacePath(request.path);
    const resolved = await this.#resolveTarget(
      request.threadId,
      normalizedPath,
      'directory',
    );
    const result = await this.appServerClient.readDirectory(
      resolved.targetPath,
    );

    return {
      root: resolved.rootPath,
      path: normalizedPath,
      entries: result.entries
        .map((entry) => ({
          name: entry.fileName,
          path: joinWorkspacePath(normalizedPath, entry.fileName),
          isDirectory: entry.isDirectory,
          isFile: entry.isFile,
        }))
        .sort(compareWorkspaceEntries),
    };
  }

  async readFile(
    request: WorkspaceReadFileRequest,
  ): Promise<WorkspaceReadFileResponse> {
    const normalizedPath = normalizeWorkspacePath(request.path);
    if (normalizedPath.length === 0) {
      throw new WorkspaceServiceError('Workspace file path is required', 400);
    }

    const resolved = await this.#resolveTarget(
      request.threadId,
      normalizedPath,
      'file',
    );
    const sizeBytes = toNumber(resolved.stats.size);
    const modifiedAtMs = Math.round(toNumber(resolved.stats.mtimeMs));

    if (sizeBytes > MAX_TEXT_PREVIEW_BYTES) {
      return {
        root: resolved.rootPath,
        path: normalizedPath,
        kind: 'tooLarge',
        sizeBytes,
        modifiedAtMs,
      };
    }

    const result = await this.appServerClient.readFile(resolved.targetPath);
    const decoded = Buffer.from(result.dataBase64, 'base64');
    if (!isLikelyTextBuffer(decoded)) {
      return {
        root: resolved.rootPath,
        path: normalizedPath,
        kind: 'binary',
        sizeBytes,
        modifiedAtMs,
      };
    }

    return {
      root: resolved.rootPath,
      path: normalizedPath,
      kind: 'text',
      sizeBytes,
      modifiedAtMs,
      content: decoded.toString('utf8'),
    };
  }

  async searchFiles(
    request: WorkspaceSearchFilesRequest,
  ): Promise<WorkspaceSearchFilesResponse> {
    const query = normalizeWorkspaceSearchQuery(request.query);
    const limit = normalizeWorkspaceSearchLimit(request.limit);
    const rootPath = await this.#resolveWorkspaceRoot(request.threadId);

    if (query.length === 0) {
      return {
        root: rootPath,
        query,
        matches: [],
      };
    }

    const ig = await loadGitignore(rootPath);
    const matches = await searchWorkspaceEntries(rootPath, query, limit, ig);
    return {
      root: rootPath,
      query,
      matches: matches.map((match) => ({
        name: getPathBaseName(match.path),
        path: match.path,
        isDirectory: match.isDirectory,
        isFile: match.isFile,
      })),
    };
  }

  async #resolveWorkspaceRoot(threadId: string): Promise<string> {
    const cachedRoot = this.#workspaceRootByThreadId.get(threadId);
    if (cachedRoot) {
      return cachedRoot;
    }

    const result = await this.appServerClient.readThreadSummary(threadId);
    const cwd = result.thread.cwd.trim();
    if (cwd.length === 0) {
      throw new WorkspaceServiceError('Thread workspace is unavailable', 409);
    }

    const workspaceRoot = await realpath(cwd).catch((error: unknown) => {
      throw toWorkspacePathError(error, cwd);
    });
    const workspaceStats = await stat(workspaceRoot).catch((error: unknown) => {
      throw toWorkspacePathError(error, workspaceRoot);
    });

    if (!workspaceStats.isDirectory()) {
      throw new WorkspaceServiceError(
        'Thread workspace root is not a directory',
        409,
      );
    }

    this.#workspaceRootByThreadId.set(threadId, workspaceRoot);
    return workspaceRoot;
  }

  async #resolveTarget(
    threadId: string,
    normalizedPath: string,
    expectedKind: 'directory' | 'file',
  ): Promise<{
    rootPath: string;
    targetPath: string;
    stats: Awaited<ReturnType<typeof stat>>;
  }> {
    const rootPath = await this.#resolveWorkspaceRoot(threadId);
    const candidatePath =
      normalizedPath.length > 0
        ? path.resolve(rootPath, ...normalizedPath.split('/'))
        : rootPath;

    const targetPath = await realpath(candidatePath).catch((error: unknown) => {
      throw toWorkspacePathError(error, candidatePath);
    });

    if (!isPathWithinRoot(rootPath, targetPath)) {
      throw new WorkspaceServiceError(
        'Workspace path must stay within the thread workspace root',
        403,
      );
    }

    const targetStats = await stat(targetPath).catch((error: unknown) => {
      throw toWorkspacePathError(error, targetPath);
    });

    if (expectedKind === 'directory' && !targetStats.isDirectory()) {
      throw new WorkspaceServiceError(
        'Requested workspace path is not a directory',
        400,
      );
    }

    if (expectedKind === 'file' && !targetStats.isFile()) {
      throw new WorkspaceServiceError(
        'Requested workspace path is not a file',
        400,
      );
    }

    return {
      rootPath,
      targetPath,
      stats: targetStats,
    };
  }
}

function normalizeWorkspacePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return '';
  }

  const normalized = trimmed.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('\\') ||
    /^[A-Za-z]:/.test(normalized) ||
    path.win32.isAbsolute(normalized)
  ) {
    throw new WorkspaceServiceError('Workspace paths must be relative', 400);
  }

  const segments = normalized
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');

  if (segments.some((segment) => segment === '..')) {
    throw new WorkspaceServiceError(
      'Workspace path must stay within the thread workspace root',
      403,
    );
  }

  return segments.join('/');
}

function normalizeWorkspaceSearchQuery(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function normalizeWorkspaceSearchLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_WORKSPACE_SEARCH_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(value), MAX_WORKSPACE_SEARCH_LIMIT));
}

function joinWorkspacePath(parentPath: string, entryName: string): string {
  return parentPath.length > 0 ? `${parentPath}/${entryName}` : entryName;
}

function getPathBaseName(workspacePath: string): string {
  const normalized = workspacePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? workspacePath;
}

function compareWorkspaceEntries(
  left: WorkspaceEntry,
  right: WorkspaceEntry,
): number {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath) &&
      !path.win32.isAbsolute(relativePath))
  );
}

function isLikelyTextBuffer(value: Buffer): boolean {
  if (value.length === 0) {
    return true;
  }

  if (value.includes(0)) {
    return false;
  }

  const decoded = value.toString('utf8');
  return Buffer.from(decoded, 'utf8').equals(value);
}

function toWorkspacePathError(
  error: unknown,
  targetPath: string,
): WorkspaceServiceError {
  if (isErrnoException(error)) {
    switch (error.code) {
      case 'ENOENT':
      case 'ENOTDIR':
        return new WorkspaceServiceError('Workspace path not found', 404);
      case 'EACCES':
      case 'EPERM':
        return new WorkspaceServiceError(
          'Workspace path cannot be accessed',
          403,
        );
    }
  }

  void targetPath;
  return new WorkspaceServiceError('Workspace path cannot be resolved', 500);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function toNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

async function searchWorkspaceEntries(
  rootPath: string,
  query: string,
  limit: number,
  ig: Ignore | null,
): Promise<
  Array<{
    path: string;
    isDirectory: boolean;
    isFile: boolean;
  }>
> {
  const matches: Array<{
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    score: number;
  }> = [];
  const queue = [{ absolutePath: rootPath, relativePath: '' }];
  let queueIndex = 0;
  let scannedEntries = 0;

  while (
    queueIndex < queue.length &&
    scannedEntries < MAX_WORKSPACE_SEARCH_ENTRIES
  ) {
    const current = queue[queueIndex];
    queueIndex += 1;
    if (!current) {
      break;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(current.absolutePath, {
        withFileTypes: true,
      });
    } catch (error) {
      if (isSkippableWorkspaceSearchError(error)) {
        continue;
      }
      throw error;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (scannedEntries >= MAX_WORKSPACE_SEARCH_ENTRIES) {
        break;
      }
      scannedEntries += 1;

      if (entry.isSymbolicLink()) {
        continue;
      }

      const relativePath = joinWorkspacePath(current.relativePath, entry.name);
      const isDirectory = entry.isDirectory();
      const isFile = entry.isFile();

      if (isDirectory && shouldSkipWorkspaceSearchDirectory(entry.name)) {
        continue;
      }

      if (ig && isIgnoredByGitignore(relativePath, isDirectory, ig)) {
        continue;
      }

      const score = scoreWorkspaceSearchMatch(relativePath, query);
      if (score !== null) {
        matches.push({
          path: relativePath,
          isDirectory,
          isFile,
          score,
        });
      }

      if (isDirectory) {
        queue.push({
          absolutePath: path.join(current.absolutePath, entry.name),
          relativePath,
        });
      }
    }
  }

  matches.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? 1 : -1;
    }
    return left.path.localeCompare(right.path);
  });

  return matches.slice(0, limit).map(({ score: _score, ...match }) => match);
}

function scoreWorkspaceSearchMatch(
  pathValue: string,
  query: string,
): number | null {
  const normalizedPath = pathValue.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  const baseName = getPathBaseName(normalizedPath);

  if (baseName === normalizedQuery) {
    return 0;
  }
  if (normalizedPath === normalizedQuery) {
    return 1;
  }
  if (baseName.startsWith(normalizedQuery)) {
    return 10 + baseName.length - normalizedQuery.length;
  }
  if (normalizedPath.startsWith(normalizedQuery)) {
    return 20 + normalizedPath.length - normalizedQuery.length;
  }

  const baseIndex = baseName.indexOf(normalizedQuery);
  if (baseIndex >= 0) {
    return 40 + baseIndex;
  }

  const pathIndex = normalizedPath.indexOf(normalizedQuery);
  if (pathIndex >= 0) {
    return 80 + pathIndex;
  }

  const baseFuzzyScore = getSubsequenceScore(baseName, normalizedQuery);
  if (baseFuzzyScore !== null) {
    return 120 + baseFuzzyScore;
  }

  const pathFuzzyScore = getSubsequenceScore(normalizedPath, normalizedQuery);
  if (pathFuzzyScore !== null) {
    return 180 + pathFuzzyScore;
  }

  return null;
}

function getSubsequenceScore(value: string, query: string): number | null {
  if (query.length === 0) {
    return 0;
  }

  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (
    let index = 0;
    index < value.length && queryIndex < query.length;
    index += 1
  ) {
    if (value[index] !== query[queryIndex]) {
      continue;
    }
    if (firstMatch < 0) {
      firstMatch = index;
    }
    lastMatch = index;
    queryIndex += 1;
  }

  if (queryIndex !== query.length || firstMatch < 0 || lastMatch < 0) {
    return null;
  }

  return lastMatch - firstMatch + (value.length - query.length);
}

function isSkippableWorkspaceSearchError(error: unknown): boolean {
  return (
    isErrnoException(error) &&
    ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code ?? '')
  );
}

function shouldSkipWorkspaceSearchDirectory(name: string): boolean {
  return WORKSPACE_SEARCH_SKIPPED_DIRECTORIES.has(name);
}

async function loadGitignore(rootPath: string): Promise<Ignore | null> {
  const gitignorePath = path.join(rootPath, '.gitignore');
  let content: string;
  try {
    content = await readFile(gitignorePath, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code !== 'ENOENT') {
      console.warn(
        `[workspaceService] Failed to read .gitignore: ${error.message}`,
      );
    }
    return null;
  }

  const ig = ignore();
  ig.add(content);
  return ig;
}

function isIgnoredByGitignore(
  relativePath: string,
  isDirectory: boolean,
  ig: Ignore,
): boolean {
  const testPath = isDirectory ? `${relativePath}/` : relativePath;
  return ig.ignores(testPath);
}
