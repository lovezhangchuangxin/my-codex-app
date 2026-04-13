import { useState } from "react";

type MobilePanelView = "projects" | "project-sessions" | "thread-detail";

export function useMobilePanel() {
  const [view, setView] = useState<MobilePanelView>("projects");
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const openProject = (projectPath: string) => {
    setSelectedProjectPath(projectPath);
    setSelectedThreadId(null);
    setView("project-sessions");
  };

  const selectProject = (projectPath: string | null) => {
    setSelectedProjectPath(projectPath);
  };

  const openThread = (id: string, projectPath?: string | null) => {
    if (projectPath !== undefined) {
      setSelectedProjectPath(projectPath);
    }
    setSelectedThreadId(id);
    setView("thread-detail");
  };

  const backFromDetail = () => {
    setSelectedThreadId(null);
    setView(selectedProjectPath ? "project-sessions" : "projects");
  };

  const backToProjects = () => {
    setSelectedProjectPath(null);
    setSelectedThreadId(null);
    setView("projects");
  };

  return {
    view,
    selectedProjectPath,
    selectedThreadId,
    openProject,
    selectProject,
    openThread,
    backFromDetail,
    backToProjects
  };
}
