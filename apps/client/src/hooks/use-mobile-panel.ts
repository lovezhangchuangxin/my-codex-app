import { startTransition } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  projectSessionsUrl,
  readProjectPath,
  threadUrl,
  threadsUrl,
} from '@/lib/routing/thread-urls';

type MobilePanelView = 'projects' | 'project-sessions' | 'thread-detail';

/**
 * Mobile panel state derived entirely from the URL.
 *
 * Return interface mirrors the old useState-based hook so that callers
 * (threads-layout.tsx) don't need to change.
 */
export function useMobilePanel() {
  const navigate = useNavigate();
  const { threadId: routeThreadId } = useParams();
  const [searchParams] = useSearchParams();

  const selectedThreadId = routeThreadId ?? null;
  const selectedProjectPath = readProjectPath(searchParams);

  // Derive view from URL state
  let view: MobilePanelView;
  if (selectedThreadId) {
    view = 'thread-detail';
  } else if (selectedProjectPath) {
    view = 'project-sessions';
  } else {
    view = 'projects';
  }

  const openProject = (projectPath: string) => {
    startTransition(() => {
      navigate(projectSessionsUrl(projectPath));
    });
  };

  const openThread = (id: string, projectPath?: string | null) => {
    startTransition(() => {
      navigate(
        threadUrl(id, { projectPath: projectPath ?? selectedProjectPath }),
      );
    });
  };

  const backFromDetail = () => {
    startTransition(() => {
      if (selectedProjectPath) {
        navigate(projectSessionsUrl(selectedProjectPath));
      } else {
        navigate(threadsUrl());
      }
    });
  };

  const backToProjects = () => {
    startTransition(() => {
      navigate(threadsUrl());
    });
  };

  return {
    view,
    selectedProjectPath,
    selectedThreadId,
    openProject,
    openThread,
    backFromDetail,
    backToProjects,
  };
}
