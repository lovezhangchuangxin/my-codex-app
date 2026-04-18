import { useEffect, useMemo, useState } from 'react';

import { useBridgeClient } from '@/lib/runtime/runtime-context';
import { upsertProjectSummary } from '@/features/projects/lib/project-utils';
import type { ThreadListState } from '@my-codex-app/sdk';
import type {
  LocalConnectionState,
  ProjectImportRequest,
  ProjectSearchRequest,
  ProjectSearchResponse,
  ProjectSummary,
} from '@my-codex-app/protocol';

export type ProjectListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; projects: ProjectSummary[] }
  | { kind: 'error'; message: string };

export function useProjectHome(
  connectionState: LocalConnectionState,
  preferredProjectPath: string | null,
  runtimeThreadsState: ThreadListState,
) {
  const bridgeClient = useBridgeClient();
  const connectionKind = connectionState.kind;
  const [projectsState, setProjectsState] = useState<ProjectListState>({
    kind: 'idle',
  });
  // selectedProjectPath is now driven by URL — preferredProjectPath is the
  // source of truth and passed through directly.
  const selectedProjectPath = preferredProjectPath;
  const [projectsReloadToken, setProjectsReloadToken] = useState(0);

  useEffect(() => {
    if (!canQueryBridge(connectionKind)) {
      setProjectsState({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setProjectsState((current) =>
      current.kind === 'ready' ? current : { kind: 'loading' },
    );

    void bridgeClient
      .listProjects({ signal: controller.signal })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setProjectsState({
          kind: 'ready',
          projects: response.data,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Unable to load projects';
        setProjectsState((current) =>
          current.kind === 'ready'
            ? current
            : {
                kind: 'error',
                message,
              },
        );
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bridgeClient, connectionKind, projectsReloadToken]);

  function refreshProjects() {
    setProjectsReloadToken((current) => current + 1);
  }

  async function searchProjects(
    request: ProjectSearchRequest,
  ): Promise<ProjectSearchResponse> {
    return bridgeClient.searchProjects(request);
  }

  async function importProject(
    request: ProjectImportRequest,
  ): Promise<ProjectSummary> {
    const response = await bridgeClient.importProject(request);
    setProjectsState((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            projects: upsertProjectSummary(current.projects, response.project),
          }
        : current,
    );
    refreshProjects();
    return response.project;
  }

  const sessionsState = useMemo<ThreadListState>(() => {
    if (!selectedProjectPath) {
      return { kind: 'idle' };
    }
    if (!canQueryBridge(connectionKind)) {
      // Preserve last-known ready state during transient connection loss.
      if (runtimeThreadsState.kind === 'ready') {
        return {
          kind: 'ready',
          threads: runtimeThreadsState.threads.filter(
            (t) => t.cwd === selectedProjectPath,
          ),
        };
      }
      return { kind: 'idle' };
    }
    if (runtimeThreadsState.kind === 'loading') {
      return { kind: 'loading' };
    }
    if (runtimeThreadsState.kind === 'error') {
      return { kind: 'error', message: runtimeThreadsState.message };
    }
    if (runtimeThreadsState.kind === 'ready') {
      return {
        kind: 'ready',
        threads: runtimeThreadsState.threads.filter(
          (t) => t.cwd === selectedProjectPath,
        ),
      };
    }
    return { kind: 'idle' };
  }, [runtimeThreadsState, selectedProjectPath, connectionKind]);

  return {
    importProject,
    projectsState,
    refreshProjects,
    searchProjects,
    selectedProjectPath,
    sessionsState,
  };
}

function canQueryBridge(connectionKind: LocalConnectionState['kind']): boolean {
  switch (connectionKind) {
    case 'unpaired':
    case 'revoked':
    case 'expired':
    case 'unreachable':
      return false;
    default:
      return true;
  }
}
