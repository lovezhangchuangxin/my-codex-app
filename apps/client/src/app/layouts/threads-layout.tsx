import { startTransition, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ProjectImportSheet } from '@/features/projects/components/project-import-sheet';
import { ProjectsPanel } from '@/features/projects/components/projects-panel';
import { ProjectSessionsPanel } from '@/features/projects/components/project-sessions-panel';
import { useProjectHome } from '@/features/projects/hooks/use-project-home';
import { ThreadDetailPanel } from '@/features/threads/components/thread-detail-panel';
import { useMobilePanel } from '@/hooks/use-mobile-panel';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  projectSessionsUrl,
  readProjectPath,
  readRequestKey,
  threadUrl,
  threadsUrl,
} from '@/lib/routing/thread-urls';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useRuntime } from '@/lib/runtime/runtime-provider';
import { useRuntimeSnapshot } from '@/lib/runtime/use-runtime-snapshot';
import type { ThreadDetailState, ThreadListState } from '@my-codex-app/sdk';
import type {
  LocalConnectionState,
  ThreadReviewRequest,
  ThreadSummary,
  ThreadTurnSettingsOverrides,
} from '@my-codex-app/protocol';

const LAST_PROJECT_KEY = 'threads.lastProjectPath';

function readLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

function saveLastProject(path: string | null): void {
  try {
    if (path) {
      localStorage.setItem(LAST_PROJECT_KEY, path);
    } else {
      localStorage.removeItem(LAST_PROJECT_KEY);
    }
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

export function ThreadsLayout() {
  const { t } = useI18n();
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const navigate = useNavigate();
  const { threadId } = useParams();
  const [searchParams] = useSearchParams();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const mobilePanel = useMobilePanel();
  const [projectImportOpen, setProjectImportOpen] = useState(false);

  const routeThreadId = threadId ?? null;
  const highlightedRequestKey = readRequestKey(searchParams);

  // Project path: primary source is the URL query param.
  // On desktop, fall back to localStorage so refresh at /threads preserves
  // the last-selected project in the sessions panel.
  const urlProjectPath = readProjectPath(searchParams);
  const routeProjectPath = isDesktop
    ? (urlProjectPath ?? readLastProject())
    : urlProjectPath;

  const projectHome = useProjectHome(
    snapshot.connection,
    routeProjectPath,
    snapshot.threads,
  );

  const selectedProjectPath = routeProjectPath;
  const selectedProject =
    projectHome.projectsState.kind === 'ready' && selectedProjectPath
      ? (projectHome.projectsState.projects.find(
          (project) => project.path === selectedProjectPath,
        ) ?? null)
      : null;

  // Both desktop and mobile use the URL for active thread
  const activeThreadId = routeThreadId;

  const displayedDetailState: ThreadDetailState =
    activeThreadId === null
      ? { kind: 'idle' }
      : snapshot.selectedThreadId === activeThreadId
        ? snapshot.detail
        : unresolvedRouteDetailState(activeThreadId, snapshot.connection, t);

  const detailThreadsState = selectedProjectPath
    ? filterThreadsStateByProject(snapshot.threads, selectedProjectPath)
    : snapshot.threads;

  // Select the thread in the runtime whenever the URL changes
  useEffect(() => {
    void runtime.selectThread(activeThreadId);
  }, [runtime, activeThreadId]);

  // Backfill ?project= when viewing a thread that lacks it (backward compat
  // for existing deep links like /threads/abc123). Uses a ref to prevent
  // repeated navigations on the same thread.
  const backfilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!routeThreadId || urlProjectPath) return;
    if (backfilledRef.current.has(routeThreadId)) return;

    let inferredPath: string | null = null;

    if (
      snapshot.selectedThreadId === routeThreadId &&
      snapshot.detail.kind === 'ready'
    ) {
      inferredPath = snapshot.detail.thread.cwd;
    } else if (snapshot.threads.kind === 'ready') {
      inferredPath =
        snapshot.threads.threads.find((t) => t.id === routeThreadId)?.cwd ??
        null;
    }

    if (inferredPath) {
      backfilledRef.current.add(routeThreadId);
      navigate(threadUrl(routeThreadId, { projectPath: inferredPath }), {
        replace: true,
      });
    }
  }, [routeThreadId, urlProjectPath, snapshot, navigate]);

  // Validate project path against the loaded project list. Redirect when the
  // project referenced in the URL no longer exists. Skip when the list is
  // empty (still loading or no projects at all) to avoid premature redirects.
  useEffect(() => {
    if (!urlProjectPath) return;
    if (projectHome.projectsState.kind !== 'ready') return;
    if (projectHome.projectsState.projects.length === 0) return;

    const isValid = projectHome.projectsState.projects.some(
      (p) => p.path === urlProjectPath,
    );

    if (!isValid) {
      saveLastProject(null);
      if (routeThreadId) {
        navigate(`/threads/${encodeURIComponent(routeThreadId)}`, {
          replace: true,
        });
      } else {
        navigate(threadsUrl(), { replace: true });
      }
    }
  }, [urlProjectPath, routeThreadId, projectHome.projectsState, navigate]);

  // ---------------------------------------------------------------------------
  // Navigation handlers — all URL-driven
  // ---------------------------------------------------------------------------

  function handleOpenProject(projectPath: string) {
    saveLastProject(projectPath);
    navigate(projectSessionsUrl(projectPath));
  }

  async function createThreadInProject(projectPath: string) {
    try {
      const nextThreadId = await runtime.startThread({ cwd: projectPath });
      projectHome.refreshProjects();
      saveLastProject(projectPath);
      startTransition(() => {
        navigate(threadUrl(nextThreadId, { projectPath }));
      });
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, t));
      return false;
    }
  }

  function handleCreateThread(projectPath: string) {
    void createThreadInProject(projectPath);
  }

  function handleOpenThread(nextThreadId: string) {
    startTransition(() => {
      navigate(
        threadUrl(nextThreadId, {
          projectPath: selectedProjectPath,
          requestKey: highlightedRequestKey,
        }),
      );
    });
  }

  async function handleRenameThread(threadId: string, name: string) {
    try {
      await runtime.renameThread(threadId, name);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, t));
      return false;
    }
  }

  async function handleImportProject(
    request: Parameters<typeof projectHome.importProject>[0],
  ) {
    const project = await projectHome.importProject(request);
    saveLastProject(project.path);
    navigate(projectSessionsUrl(project.path));
    return project;
  }

  async function handleSendMessage(
    activeId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides,
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

  async function handleRespond(
    request: Parameters<typeof runtime.respondToRequest>[0],
  ) {
    try {
      await runtime.respondToRequest(request);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, t));
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Mobile: full-screen panel switching (view derived from URL via useMobilePanel)
  if (!isDesktop) {
    if (mobilePanel.view === 'thread-detail' && mobilePanel.selectedThreadId) {
      return (
        <div className="h-full">
          <ThreadDetailPanel
            connectionState={snapshot.connection}
            compactPending={
              mobilePanel.selectedThreadId !== null &&
              snapshot.mutations.compactingThreadIds.includes(
                mobilePanel.selectedThreadId,
              )
            }
            detailState={displayedDetailState}
            highlightedRequestKey={highlightedRequestKey}
            interruptPending={snapshot.mutations.interruptPending}
            isDesktop={false}
            lastError={snapshot.mutations.lastError}
            onBack={mobilePanel.backFromDetail}
            onCompactThread={handleCompactThread}
            onCreateThread={createThreadInProject}
            onOpenThread={handleOpenThread}
            onRenameThread={handleRenameThread}
            onRespondToRequest={handleRespond}
            onSendMessage={handleSendMessage}
            onInterrupt={handleInterrupt}
            onStartReview={handleStartReview}
            respondingRequestIds={snapshot.mutations.respondingRequestIds}
            selectedThreadId={mobilePanel.selectedThreadId}
            sendMessagePending={snapshot.mutations.sendMessagePending}
            threadsState={
              selectedProjectPath !== null
                ? projectHome.sessionsState
                : detailThreadsState
            }
          />
        </div>
      );
    }

    if (mobilePanel.view === 'project-sessions' && selectedProjectPath) {
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

  // Desktop: three-column project → session → detail layout
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
              navigate(
                selectedProjectPath
                  ? projectSessionsUrl(selectedProjectPath)
                  : threadsUrl(),
              );
            });
          }}
          onCompactThread={handleCompactThread}
          onCreateThread={createThreadInProject}
          onOpenThread={handleOpenThread}
          onRenameThread={handleRenameThread}
          onRespondToRequest={handleRespond}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          onStartReview={handleStartReview}
          respondingRequestIds={snapshot.mutations.respondingRequestIds}
          selectedThreadId={routeThreadId}
          sendMessagePending={snapshot.mutations.sendMessagePending}
          threadsState={detailThreadsState}
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown, t: (key: string) => string) {
  return error instanceof Error
    ? error.message
    : t('common.unknownClientError');
}

function unresolvedRouteDetailState(
  threadId: string,
  connectionState: LocalConnectionState,
  t: (key: string) => string,
): ThreadDetailState {
  switch (connectionState.kind) {
    case 'unpaired':
      return {
        kind: 'error',
        threadId,
        message: t('detail.banner.unpaired.message'),
      };
    case 'revoked':
      return {
        kind: 'error',
        threadId,
        message: connectionState.message ?? t('detail.banner.revoked.message'),
      };
    case 'expired':
      return {
        kind: 'error',
        threadId,
        message: connectionState.message ?? t('detail.banner.expired.message'),
      };
    case 'disconnected':
      return {
        kind: 'error',
        threadId,
        message:
          connectionState.message ?? t('detail.banner.disconnected.message'),
      };
    case 'unreachable':
      return {
        kind: 'error',
        threadId,
        message:
          connectionState.message ?? t('detail.banner.unreachable.message'),
      };
    default:
      return { kind: 'loading', threadId };
  }
}

function filterThreadsStateByProject(
  threadsState: ThreadListState,
  projectPath: string,
): ThreadListState {
  if (threadsState.kind !== 'ready') {
    return threadsState;
  }

  return {
    kind: 'ready',
    threads: threadsState.threads.filter((thread) =>
      isThreadInProject(thread, projectPath),
    ),
  };
}

function isThreadInProject(
  thread: ThreadSummary,
  projectPath: string,
): boolean {
  return thread.cwd === projectPath;
}
