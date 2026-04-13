import { useEffect, useRef, useState } from "react";

import { useBridgeClient } from "@/lib/runtime/runtime-provider";
import { upsertProjectSummary } from "@/features/projects/lib/project-utils";
import type { ThreadListState } from "@my-codex-app/sdk";
import type {
  LocalConnectionState,
  ProjectImportRequest,
  ProjectSearchRequest,
  ProjectSearchResponse,
  ProjectSummary
} from "@my-codex-app/protocol";

export type ProjectListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; projects: ProjectSummary[] }
  | { kind: "error"; message: string };

export function useProjectHome(
  connectionState: LocalConnectionState,
  preferredProjectPath: string | null,
  runtimeThreadsState: ThreadListState
) {
  const bridgeClient = useBridgeClient();
  const connectionKind = connectionState.kind;
  const lastPreferredProjectPathRef = useRef<string | null>(null);
  const [projectsState, setProjectsState] = useState<ProjectListState>({ kind: "idle" });
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const [sessionsState, setSessionsState] = useState<ThreadListState>({ kind: "idle" });
  const [projectsReloadToken, setProjectsReloadToken] = useState(0);
  const [sessionsReloadToken, setSessionsReloadToken] = useState(0);

  useEffect(() => {
    if (
      preferredProjectPath &&
      preferredProjectPath !== lastPreferredProjectPathRef.current
    ) {
      lastPreferredProjectPathRef.current = preferredProjectPath;
      setSelectedProjectPath(preferredProjectPath);
      return;
    }

    if (preferredProjectPath === null && lastPreferredProjectPathRef.current !== null) {
      lastPreferredProjectPathRef.current = null;
    }
  }, [preferredProjectPath]);

  useEffect(() => {
    if (!canQueryBridge(connectionKind)) {
      setProjectsState({ kind: "idle" });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setProjectsState((current) => (current.kind === "ready" ? current : { kind: "loading" }));

    void bridgeClient
      .listProjects({ signal: controller.signal })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setProjectsState({
          kind: "ready",
          projects: response.data
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to load projects";
        setProjectsState((current) =>
          current.kind === "ready"
            ? current
            : {
                kind: "error",
                message
              }
        );
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bridgeClient, connectionKind, projectsReloadToken]);

  useEffect(() => {
    if (!canQueryBridge(connectionKind)) {
      setSessionsState({ kind: "idle" });
      return;
    }

    if (!selectedProjectPath) {
      setSessionsState({ kind: "idle" });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSessionsState({ kind: "loading" });

    void bridgeClient
      .listThreads({ cwd: selectedProjectPath }, { signal: controller.signal })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setSessionsState({
          kind: "ready",
          threads: response.data
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to load sessions";
        setSessionsState((current) =>
          current.kind === "ready"
            ? current
            : {
                kind: "error",
                message
              }
        );
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bridgeClient, connectionKind, selectedProjectPath, sessionsReloadToken]);

  useEffect(() => {
    if (!canQueryBridge(connectionKind)) {
      return;
    }

    if (runtimeThreadsState.kind !== "ready") {
      return;
    }

    const timer = window.setTimeout(() => {
      setProjectsReloadToken((current) => current + 1);
      if (selectedProjectPath !== null) {
        setSessionsReloadToken((current) => current + 1);
      }
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [connectionKind, runtimeThreadsState, selectedProjectPath]);

  function selectProject(projectPath: string | null) {
    setSelectedProjectPath(projectPath);
  }

  function refreshProjects() {
    setProjectsReloadToken((current) => current + 1);
  }

  function refreshSessions() {
    setSessionsReloadToken((current) => current + 1);
  }

  async function searchProjects(request: ProjectSearchRequest): Promise<ProjectSearchResponse> {
    return bridgeClient.searchProjects(request);
  }

  async function importProject(request: ProjectImportRequest): Promise<ProjectSummary> {
    const response = await bridgeClient.importProject(request);
    setSelectedProjectPath(response.project.path);
    setProjectsState((current) =>
      current.kind === "ready"
        ? {
            kind: "ready",
            projects: upsertProjectSummary(current.projects, response.project)
          }
        : current
    );
    refreshProjects();
    refreshSessions();
    return response.project;
  }

  return {
    importProject,
    projectsState,
    refreshProjects,
    refreshSessions,
    searchProjects,
    selectedProjectPath,
    selectProject,
    sessionsState
  };
}

function canQueryBridge(connectionKind: LocalConnectionState["kind"]): boolean {
  switch (connectionKind) {
    case "unpaired":
    case "revoked":
    case "expired":
      return false;
    default:
      return true;
  }
}
