import { startTransition, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ProjectImportSheet } from "@/features/projects/components/project-import-sheet";
import { ProjectsPanel } from "@/features/projects/components/projects-panel";
import { ProjectSessionsPanel } from "@/features/projects/components/project-sessions-panel";
import { useProjectHome } from "@/features/projects/hooks/use-project-home";
import { ThreadDetailPanel } from "@/features/threads/components/thread-detail-panel";
import { useMobilePanel } from "@/hooks/use-mobile-panel";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";
import type { ThreadDetailState } from "@my-codex-app/sdk";
import type {
  LocalConnectionState,
  ThreadReviewRequest,
  ThreadTurnSettingsOverrides
} from "@my-codex-app/protocol";

export function ThreadsLayout() {
  const { t } = useI18n();
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const navigate = useNavigate();
  const location = useLocation();
  const { threadId } = useParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const mobilePanel = useMobilePanel();
  const [projectImportOpen, setProjectImportOpen] = useState(false);

  const routeThreadId = threadId ?? null;
  const highlightedRequestKey = new URLSearchParams(location.search).get("request");
  const routeProjectPath = resolveThreadProjectPath(
    routeThreadId,
    snapshot.selectedThreadId,
    snapshot.detail,
    snapshot.threads
  );
  const projectHome = useProjectHome(snapshot.connection, routeProjectPath, snapshot.threads);
  const selectedProjectPath = isDesktop
    ? projectHome.selectedProjectPath ?? routeProjectPath
    : routeProjectPath ?? projectHome.selectedProjectPath;
  const selectedProject =
    projectHome.projectsState.kind === "ready" && selectedProjectPath
      ? projectHome.projectsState.projects.find((project) => project.path === selectedProjectPath) ??
        null
      : null;

  // Desktop: use URL param. Mobile: use panel state machine.
  const activeThreadId = isDesktop ? routeThreadId : mobilePanel.selectedThreadId;

  const displayedDetailState: ThreadDetailState =
    activeThreadId === null
      ? { kind: "idle" }
      : snapshot.selectedThreadId === activeThreadId
        ? snapshot.detail
        : unresolvedRouteDetailState(activeThreadId, snapshot.connection, t);

  useEffect(() => {
    void runtime.selectThread(isDesktop ? routeThreadId : mobilePanel.selectedThreadId);
  }, [runtime, isDesktop, routeThreadId, mobilePanel.selectedThreadId]);

  useEffect(() => {
    if (
      !isDesktop &&
      selectedProjectPath !== null &&
      mobilePanel.selectedProjectPath !== selectedProjectPath
    ) {
      mobilePanel.selectProject(selectedProjectPath);
    }
  }, [isDesktop, mobilePanel, selectedProjectPath]);

  useEffect(() => {
    if (
      !isDesktop &&
      routeThreadId &&
      (mobilePanel.view !== "thread-detail" ||
        mobilePanel.selectedThreadId !== routeThreadId ||
        (selectedProjectPath !== null &&
          mobilePanel.selectedProjectPath !== selectedProjectPath))
    ) {
      mobilePanel.openThread(routeThreadId, selectedProjectPath ?? undefined);
    }
  }, [isDesktop, mobilePanel, routeThreadId, selectedProjectPath]);

  function handleOpenProject(projectPath: string) {
    projectHome.selectProject(projectPath);
    if (!isDesktop) {
      mobilePanel.openProject(projectPath);
    }
  }

  function handleCreateThread(projectPath: string) {
    void (async () => {
      try {
        const nextThreadId = await runtime.startThread({ cwd: projectPath });
        projectHome.refreshProjects();
        projectHome.refreshSessions();
        startTransition(() => {
          if (isDesktop) {
            navigate(`/threads/${encodeURIComponent(nextThreadId)}`);
          } else {
            mobilePanel.openThread(nextThreadId, projectPath);
          }
        });
      } catch (error) {
        toast.error(toErrorMessage(error, t));
      }
    })();
  }

  function handleOpenThread(nextThreadId: string) {
    if (isDesktop) {
      startTransition(() => {
        navigate(`/threads/${encodeURIComponent(nextThreadId)}`);
      });
    } else {
      mobilePanel.openThread(nextThreadId, selectedProjectPath);
    }
  }

  async function handleImportProject(request: Parameters<typeof projectHome.importProject>[0]) {
    const project = await projectHome.importProject(request);
    if (isDesktop) {
      projectHome.selectProject(project.path);
    } else {
      mobilePanel.openProject(project.path);
    }
    return project;
  }

  async function handleSendMessage(
    activeId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides
  ) {
    try {
      await runtime.sendMessage(activeId, text, settings);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, t));
      return false;
    }
  }

  async function handleInterrupt(activeId: string, turnId: string) {
    try {
      await runtime.interruptTurn(activeId, turnId);
    } catch (error) {
      toast.error(toErrorMessage(error, t));
    }
  }

  async function handleCompactThread(threadId: string) {
    try {
      await runtime.compactThread(threadId);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, t));
      return false;
    }
  }

  async function handleStartReview(request: ThreadReviewRequest) {
    try {
      await runtime.startReview(request);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, t));
      return false;
    }
  }

  async function handleRespond(request: Parameters<typeof runtime.respondToRequest>[0]) {
    try {
      await runtime.respondToRequest(request);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, t));
      return false;
    }
  }

  // Mobile: full-screen panel switching
  if (!isDesktop) {
    if (mobilePanel.view === "thread-detail" && mobilePanel.selectedThreadId) {
      return (
        <div className="h-full">
          <ThreadDetailPanel
            connectionState={snapshot.connection}
            compactPending={
              mobilePanel.selectedThreadId !== null &&
              snapshot.mutations.compactingThreadIds.includes(mobilePanel.selectedThreadId)
            }
            detailState={displayedDetailState}
            highlightedRequestKey={highlightedRequestKey}
            interruptPending={snapshot.mutations.interruptPending}
            isDesktop={false}
            lastError={snapshot.mutations.lastError}
            onBack={mobilePanel.backFromDetail}
            onCompactThread={handleCompactThread}
            onOpenThread={handleOpenThread}
            onRespondToRequest={handleRespond}
            onSendMessage={handleSendMessage}
            onInterrupt={handleInterrupt}
            onStartReview={handleStartReview}
            respondingRequestIds={snapshot.mutations.respondingRequestIds}
            selectedThreadId={mobilePanel.selectedThreadId}
            sendMessagePending={snapshot.mutations.sendMessagePending}
            threadsState={selectedProjectPath !== null ? projectHome.sessionsState : snapshot.threads}
          />
        </div>
      );
    }

    if (mobilePanel.view === "project-sessions" && selectedProjectPath) {
      return (
        <div className="h-full">
          <ProjectSessionsPanel
            className="h-full min-h-0 rounded-none py-0"
            connectionState={snapshot.connection}
            createPending={snapshot.mutations.startThreadPending}
            isDesktop={false}
            onBack={mobilePanel.backToProjects}
            onCreateThread={handleCreateThread}
            onOpenThread={handleOpenThread}
            project={selectedProject}
            selectedThreadId={null}
            sessionsState={projectHome.sessionsState}
          />
        </div>
      );
    }

    return (
      <div className="h-full">
        <ProjectsPanel
          className="h-full min-h-0 rounded-none py-0"
          connectionState={snapshot.connection}
          onImportProject={() => {
            setProjectImportOpen(true);
          }}
          onOpenProject={handleOpenProject}
          projectsState={projectHome.projectsState}
          selectedProjectPath={selectedProjectPath}
        />
        <ProjectImportSheet
          isDesktop={false}
          onImportProject={handleImportProject}
          onOpenChange={setProjectImportOpen}
          onSearchProjects={projectHome.searchProjects}
          open={projectImportOpen}
        />
      </div>
    );
  }

  // Desktop: three-column project -> session -> detail layout
  return (
    <div className="flex h-full">
      <div className="w-[320px] shrink-0 overflow-hidden border-r border-subtle/6">
        <ProjectsPanel
          connectionState={snapshot.connection}
          onImportProject={() => {
            setProjectImportOpen(true);
          }}
          onOpenProject={handleOpenProject}
          projectsState={projectHome.projectsState}
          selectedProjectPath={selectedProjectPath}
        />
      </div>
      <div className="w-[360px] shrink-0 overflow-hidden border-r border-subtle/6">
        <ProjectSessionsPanel
          connectionState={snapshot.connection}
          createPending={snapshot.mutations.startThreadPending}
          isDesktop
          onBack={() => {}}
          onCreateThread={handleCreateThread}
          onOpenThread={handleOpenThread}
          project={selectedProject}
          selectedThreadId={routeThreadId}
          sessionsState={projectHome.sessionsState}
        />
      </div>
      <div className="min-w-0 flex-1">
        <ThreadDetailPanel
          connectionState={snapshot.connection}
          compactPending={
            routeThreadId !== null &&
            snapshot.mutations.compactingThreadIds.includes(routeThreadId)
          }
          detailState={displayedDetailState}
          highlightedRequestKey={highlightedRequestKey}
          interruptPending={snapshot.mutations.interruptPending}
          isDesktop
          lastError={snapshot.mutations.lastError}
          onBack={() => {
            startTransition(() => {
              navigate("/threads");
            });
          }}
          onCompactThread={handleCompactThread}
          onOpenThread={handleOpenThread}
          onRespondToRequest={handleRespond}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          onStartReview={handleStartReview}
          respondingRequestIds={snapshot.mutations.respondingRequestIds}
          selectedThreadId={routeThreadId}
          sendMessagePending={snapshot.mutations.sendMessagePending}
          threadsState={selectedProjectPath !== null ? projectHome.sessionsState : snapshot.threads}
        />
      </div>
      <ProjectImportSheet
        isDesktop
        onImportProject={handleImportProject}
        onOpenChange={setProjectImportOpen}
        onSearchProjects={projectHome.searchProjects}
        open={projectImportOpen}
      />
    </div>
  );
}

function toErrorMessage(error: unknown, t: (key: string) => string) {
  return error instanceof Error ? error.message : t("common.unknownClientError");
}

function unresolvedRouteDetailState(
  threadId: string,
  connectionState: LocalConnectionState,
  t: (key: string) => string
): ThreadDetailState {
  switch (connectionState.kind) {
    case "unpaired":
      return {
        kind: "error",
        threadId,
        message: t("detail.banner.unpaired.message")
      };
    case "revoked":
      return {
        kind: "error",
        threadId,
        message: connectionState.message ?? t("detail.banner.revoked.message")
      };
    case "expired":
      return {
        kind: "error",
        threadId,
        message: connectionState.message ?? t("detail.banner.expired.message")
      };
    case "disconnected":
      return {
        kind: "error",
        threadId,
        message: connectionState.message ?? t("detail.banner.disconnected.message")
      };
    default:
      return { kind: "loading", threadId };
  }
}

function resolveThreadProjectPath(
  threadId: string | null,
  selectedThreadId: string | null,
  detailState: ThreadDetailState,
  threadsState: ReturnType<typeof useRuntimeSnapshot>["threads"]
): string | null {
  if (threadId === null) {
    return null;
  }

  if (selectedThreadId === threadId && detailState.kind === "ready") {
    return detailState.thread.cwd;
  }

  if (threadsState.kind !== "ready") {
    return null;
  }

  return threadsState.threads.find((thread) => thread.id === threadId)?.cwd ?? null;
}
