import { realpath, stat } from "node:fs/promises";
import * as path from "node:path";

import type {
  WorkspaceEntry,
  WorkspaceReadDirectoryRequest,
  WorkspaceReadDirectoryResponse,
  WorkspaceReadFileRequest,
  WorkspaceReadFileResponse
} from "@my-codex-app/protocol";

import { AppServerClient } from "./appServerClient";

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;

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
    request: WorkspaceReadDirectoryRequest
  ): Promise<WorkspaceReadDirectoryResponse> {
    const normalizedPath = normalizeWorkspacePath(request.path);
    const resolved = await this.#resolveTarget(request.threadId, normalizedPath, "directory");
    const result = await this.appServerClient.readDirectory(resolved.targetPath);

    return {
      root: resolved.rootPath,
      path: normalizedPath,
      entries: result.entries
        .map((entry) => ({
          name: entry.fileName,
          path: joinWorkspacePath(normalizedPath, entry.fileName),
          isDirectory: entry.isDirectory,
          isFile: entry.isFile
        }))
        .sort(compareWorkspaceEntries)
    };
  }

  async readFile(request: WorkspaceReadFileRequest): Promise<WorkspaceReadFileResponse> {
    const normalizedPath = normalizeWorkspacePath(request.path);
    if (normalizedPath.length === 0) {
      throw new WorkspaceServiceError("Workspace file path is required", 400);
    }

    const resolved = await this.#resolveTarget(request.threadId, normalizedPath, "file");
    const sizeBytes = toNumber(resolved.stats.size);
    const modifiedAtMs = Math.round(toNumber(resolved.stats.mtimeMs));

    if (sizeBytes > MAX_TEXT_PREVIEW_BYTES) {
      return {
        root: resolved.rootPath,
        path: normalizedPath,
        kind: "tooLarge",
        sizeBytes,
        modifiedAtMs
      };
    }

    const result = await this.appServerClient.readFile(resolved.targetPath);
    const decoded = Buffer.from(result.dataBase64, "base64");
    if (!isLikelyTextBuffer(decoded)) {
      return {
        root: resolved.rootPath,
        path: normalizedPath,
        kind: "binary",
        sizeBytes,
        modifiedAtMs
      };
    }

    return {
      root: resolved.rootPath,
      path: normalizedPath,
      kind: "text",
      sizeBytes,
      modifiedAtMs,
      content: decoded.toString("utf8")
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
      throw new WorkspaceServiceError("Thread workspace is unavailable", 409);
    }

    const workspaceRoot = await realpath(cwd).catch((error: unknown) => {
      throw toWorkspacePathError(error, cwd);
    });
    const workspaceStats = await stat(workspaceRoot).catch((error: unknown) => {
      throw toWorkspacePathError(error, workspaceRoot);
    });

    if (!workspaceStats.isDirectory()) {
      throw new WorkspaceServiceError("Thread workspace root is not a directory", 409);
    }

    this.#workspaceRootByThreadId.set(threadId, workspaceRoot);
    return workspaceRoot;
  }

  async #resolveTarget(
    threadId: string,
    normalizedPath: string,
    expectedKind: "directory" | "file"
  ): Promise<{ rootPath: string; targetPath: string; stats: Awaited<ReturnType<typeof stat>> }> {
    const rootPath = await this.#resolveWorkspaceRoot(threadId);
    const candidatePath =
      normalizedPath.length > 0
        ? path.resolve(rootPath, ...normalizedPath.split("/"))
        : rootPath;

    const targetPath = await realpath(candidatePath).catch((error: unknown) => {
      throw toWorkspacePathError(error, candidatePath);
    });

    if (!isPathWithinRoot(rootPath, targetPath)) {
      throw new WorkspaceServiceError(
        "Workspace path must stay within the thread workspace root",
        403
      );
    }

    const targetStats = await stat(targetPath).catch((error: unknown) => {
      throw toWorkspacePathError(error, targetPath);
    });

    if (expectedKind === "directory" && !targetStats.isDirectory()) {
      throw new WorkspaceServiceError("Requested workspace path is not a directory", 400);
    }

    if (expectedKind === "file" && !targetStats.isFile()) {
      throw new WorkspaceServiceError("Requested workspace path is not a file", 400);
    }

    return {
      rootPath,
      targetPath,
      stats: targetStats
    };
  }
}

function normalizeWorkspacePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return "";
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("\\") ||
    /^[A-Za-z]:/.test(normalized) ||
    path.win32.isAbsolute(normalized)
  ) {
    throw new WorkspaceServiceError("Workspace paths must be relative", 400);
  }

  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");

  if (segments.some((segment) => segment === "..")) {
    throw new WorkspaceServiceError(
      "Workspace path must stay within the thread workspace root",
      403
    );
  }

  return segments.join("/");
}

function joinWorkspacePath(parentPath: string, entryName: string): string {
  return parentPath.length > 0 ? `${parentPath}/${entryName}` : entryName;
}

function compareWorkspaceEntries(left: WorkspaceEntry, right: WorkspaceEntry): number {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") &&
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

  const decoded = value.toString("utf8");
  return Buffer.from(decoded, "utf8").equals(value);
}

function toWorkspacePathError(error: unknown, targetPath: string): WorkspaceServiceError {
  if (isErrnoException(error)) {
    switch (error.code) {
      case "ENOENT":
      case "ENOTDIR":
        return new WorkspaceServiceError("Workspace path not found", 404);
      case "EACCES":
      case "EPERM":
        return new WorkspaceServiceError("Workspace path cannot be accessed", 403);
    }
  }

  void targetPath;
  return new WorkspaceServiceError("Workspace path cannot be resolved", 500);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function toNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}
