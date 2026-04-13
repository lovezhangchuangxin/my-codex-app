import type { ProjectSummary } from "@my-codex-app/protocol";

export function getProjectDisplayName(projectPath: string): string {
  const trimmedPath = projectPath.trim();
  if (trimmedPath.length === 0) {
    return "Unknown project";
  }

  const segments = trimmedPath.split(/[/\\]+/).filter(Boolean);
  return segments.at(-1) ?? trimmedPath;
}

export function matchesProjectFilter(project: ProjectSummary, searchTerm: string): boolean {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (normalizedSearch.length === 0) {
    return true;
  }

  return (
    project.displayName.toLowerCase().includes(normalizedSearch) ||
    project.path.toLowerCase().includes(normalizedSearch)
  );
}

export function upsertProjectSummary(
  projects: ProjectSummary[],
  nextProject: ProjectSummary
): ProjectSummary[] {
  const found = projects.some((project) => project.path === nextProject.path);
  const nextProjects = found
    ? projects.map((project) => (project.path === nextProject.path ? nextProject : project))
    : [...projects, nextProject];

  return sortProjects(nextProjects);
}

function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((left, right) => {
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

    return left.path.localeCompare(right.path);
  });
}
