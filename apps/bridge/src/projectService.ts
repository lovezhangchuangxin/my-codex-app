import path from "node:path";
import { readdir, realpath, stat } from "node:fs/promises";

import type {
  ProjectImportRequest,
  ProjectImportResponse,
  ProjectListResponse,
  ProjectSearchMatch,
  ProjectSearchRequest,
  ProjectSearchResponse,
  ProjectSummary
} from "@my-codex-app/protocol";

import {
  getProjectDisplayName,
  normalizeAbsolutePath,
  resolveProjectIdentityPath
} from "./projects/projectPathUtils";
import { ProjectRegistryStore } from "./projects/projectRegistryStore";
import { ThreadService } from "./threadService";

const DEFAULT_PROJECT_SEARCH_LIMIT = 12;
const MAX_PROJECT_SEARCH_LIMIT = 20;

type ProjectAccumulator = {
  path: string;
  displayName: string;
  imported: boolean;
  hasDerivedThreads: boolean;
  sessionCount: number;
  pendingRequestCount: number;
  hasActiveSession: boolean;
  available: boolean;
  lastActiveAt?: number;
};

export class ProjectServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class ProjectService {
  constructor(
    private readonly registryStore: ProjectRegistryStore,
    private readonly threadService: ThreadService
  ) {}

  async listProjects(): Promise<ProjectListResponse> {
    return {
      data: await this.#buildProjectSummaries()
    };
  }

  async searchProjects(request: ProjectSearchRequest): Promise<ProjectSearchResponse> {
    const query = request.query.trim();
    const limit = normalizeSearchLimit(request.limit);
    const projects = await this.#buildProjectSummaries();
    const knownMatches = projects.filter((project) => matchesProjectQuery(project, query));
    const pathMatches = await this.#suggestPathMatches(query, limit);

    const merged = new Map<string, ProjectSearchMatch>();
    for (const project of knownMatches) {
      merged.set(project.path, {
        kind: "knownProject",
        path: project.path,
        displayName: project.displayName,
        imported: project.imported,
        hasDerivedThreads: project.hasDerivedThreads,
        available: project.available
      });
      if (merged.size >= limit) {
        break;
      }
    }

    for (const candidate of pathMatches) {
      if (merged.has(candidate.path)) {
        continue;
      }
      merged.set(candidate.path, candidate);
      if (merged.size >= limit) {
        break;
      }
    }

    return {
      query,
      matches: [...merged.values()].slice(0, limit)
    };
  }

  async importProject(request: ProjectImportRequest): Promise<ProjectImportResponse> {
    const canonicalPath = await resolveImportProjectPath(request.path);
    this.registryStore.upsertProject(canonicalPath, nowInSeconds());

    const projects = await this.#buildProjectSummaries();
    const project = projects.find((entry) => entry.path === canonicalPath);
    if (!project) {
      throw new ProjectServiceError("Imported project could not be resolved", 500);
    }

    return { project };
  }

  async #buildProjectSummaries(): Promise<ProjectSummary[]> {
    const importedProjects = this.registryStore.listProjects();
    const threadResponse = await this.threadService.listThreads({});
    const projectMap = new Map<string, ProjectAccumulator>();

    for (const importedProject of importedProjects) {
      const pathInfo = await getProjectPathInfo(importedProject.path);
      const accumulator = projectMap.get(pathInfo.path) ?? createProjectAccumulator(pathInfo);
      accumulator.imported = true;
      accumulator.available = accumulator.available || pathInfo.available;
      projectMap.set(accumulator.path, accumulator);
    }

    for (const thread of threadResponse.data) {
      const pathInfo = await getProjectPathInfo(thread.cwd);
      if (pathInfo.path.length === 0) {
        continue;
      }

      const accumulator = projectMap.get(pathInfo.path) ?? createProjectAccumulator(pathInfo);
      accumulator.hasDerivedThreads = true;
      accumulator.available = accumulator.available || pathInfo.available;
      accumulator.sessionCount += 1;
      accumulator.pendingRequestCount += thread.pendingRequests.length;
      accumulator.hasActiveSession =
        accumulator.hasActiveSession || thread.status.type === "active";
      accumulator.lastActiveAt = Math.max(accumulator.lastActiveAt ?? 0, thread.updatedAt);
      projectMap.set(accumulator.path, accumulator);
    }

    return [...projectMap.values()]
      .map((project) => ({
        path: project.path,
        displayName: project.displayName,
        imported: project.imported,
        hasDerivedThreads: project.hasDerivedThreads,
        sessionCount: project.sessionCount,
        pendingRequestCount: project.pendingRequestCount,
        hasActiveSession: project.hasActiveSession,
        available: project.available,
        ...(project.lastActiveAt !== undefined ? { lastActiveAt: project.lastActiveAt } : {})
      }))
      .sort(compareProjects);
  }

  async #suggestPathMatches(
    query: string,
    limit: number
  ): Promise<ProjectSearchMatch[]> {
    const prepared = preparePathSuggestionQuery(query);
    if (!prepared) {
      return [];
    }

    const entries = await readdir(prepared.directory, { withFileTypes: true }).catch(
      () => null
    );
    if (!entries) {
      return [];
    }

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((entryName) =>
        entryName.toLowerCase().includes(prepared.prefix.toLowerCase())
      )
      .sort((left, right) => left.localeCompare(right))
      .slice(0, limit)
      .map((entryName) => {
        const suggestedPath = path.join(prepared.directory, entryName);
        return {
          kind: "pathSuggestion" as const,
          path: suggestedPath,
          displayName: getProjectDisplayName(suggestedPath),
          imported: false,
          hasDerivedThreads: false,
          available: true
        };
      });
  }
}

function normalizeSearchLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_PROJECT_SEARCH_LIMIT;
  }

  return Math.max(1, Math.min(Math.trunc(value), MAX_PROJECT_SEARCH_LIMIT));
}

function createProjectAccumulator(pathInfo: {
  path: string;
  displayName: string;
  available: boolean;
}): ProjectAccumulator {
  return {
    path: pathInfo.path,
    displayName: pathInfo.displayName,
    imported: false,
    hasDerivedThreads: false,
    sessionCount: 0,
    pendingRequestCount: 0,
    hasActiveSession: false,
    available: pathInfo.available
  };
}

function compareProjects(left: ProjectSummary, right: ProjectSummary): number {
  const leftActivity = left.lastActiveAt ?? 0;
  const rightActivity = right.lastActiveAt ?? 0;
  if (rightActivity !== leftActivity) {
    return rightActivity - leftActivity;
  }

  if (left.available !== right.available) {
    return Number(right.available) - Number(left.available);
  }

  if (left.sessionCount !== right.sessionCount) {
    return right.sessionCount - left.sessionCount;
  }

  if (left.imported !== right.imported) {
    return Number(right.imported) - Number(left.imported);
  }

  return left.path.localeCompare(right.path);
}

function matchesProjectQuery(project: ProjectSummary, query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return (
    project.displayName.toLowerCase().includes(normalizedQuery) ||
    project.path.toLowerCase().includes(normalizedQuery)
  );
}

async function getProjectPathInfo(rawPath: string): Promise<{
  path: string;
  displayName: string;
  available: boolean;
}> {
  const identityPath = resolveProjectIdentityPath(rawPath);
  if (identityPath === null) {
    return {
      path: rawPath.trim(),
      displayName: getProjectDisplayName(rawPath.trim()),
      available: false
    };
  }

  try {
    const resolvedPath = await realpath(identityPath);
    const resolvedStats = await stat(resolvedPath);
    if (!resolvedStats.isDirectory()) {
      return {
        path: identityPath,
        displayName: getProjectDisplayName(identityPath),
        available: false
      };
    }

    return {
      path: resolvedPath,
      displayName: getProjectDisplayName(resolvedPath),
      available: true
    };
  } catch {
    return {
      path: identityPath,
      displayName: getProjectDisplayName(identityPath),
      available: false
    };
  }
}

async function resolveImportProjectPath(inputPath: string): Promise<string> {
  const normalizedPath = normalizeAbsolutePath(inputPath, true);
  if (!normalizedPath) {
    throw new ProjectServiceError("Project path is required", 400);
  }

  const resolvedPath = await realpath(normalizedPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      throw new ProjectServiceError("Project path does not exist", 404);
    }
    throw new ProjectServiceError("Unable to resolve project path", 400);
  });
  const resolvedStats = await stat(resolvedPath).catch(() => {
    throw new ProjectServiceError("Unable to read project path", 400);
  });

  if (!resolvedStats.isDirectory()) {
    throw new ProjectServiceError("Project path must be a directory", 400);
  }

  return resolvedPath;
}

function preparePathSuggestionQuery(
  query: string
): { directory: string; prefix: string } | null {
  const normalizedPath = normalizeAbsolutePath(query, false);
  if (!normalizedPath) {
    return null;
  }

  const endsWithSeparator =
    normalizedPath.endsWith(path.sep) || normalizedPath.endsWith("/");
  const directory = endsWithSeparator ? normalizedPath : path.dirname(normalizedPath);
  const prefix = endsWithSeparator ? "" : path.basename(normalizedPath);

  return {
    directory,
    prefix
  };
}
function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
