import type {
  PendingRequest,
  ThreadRuntimeStatus,
  ThreadSummary,
  UserInput
} from "@my-codex-app/protocol";

export type ThreadStatusFilter =
  | "all"
  | "active"
  | "waitingApproval"
  | "waitingInput"
  | "idle";

export function buildThreadTitle(thread: Pick<ThreadSummary, "name" | "preview" | "id">) {
  return (thread.name ?? thread.preview) || "Untitled thread";
}

export function getWorkspaceLabel(cwd: string) {
  const trimmed = cwd.trim();
  if (trimmed.length === 0) {
    return "Unknown workspace";
  }

  const segments = trimmed.split(/[/\\]+/).filter(Boolean);
  return segments.at(-1) ?? trimmed;
}

export function formatStatusLabel(status: ThreadRuntimeStatus) {
  if (status.type !== "active") {
    switch (status.type) {
      case "idle":
        return "Idle";
      case "notLoaded":
        return "Not loaded";
      case "systemError":
        return "System error";
    }
  }

  if (status.activeFlags.includes("waitingOnApproval")) {
    return "Waiting approval";
  }

  if (status.activeFlags.includes("waitingOnUserInput")) {
    return "Waiting input";
  }

  return "Active";
}

export function formatTimestamp(value: number | undefined) {
  return value ? new Date(value * 1000).toLocaleString() : "n/a";
}

export function formatRelativeTime(seconds: number) {
  const delta = Math.floor(Date.now() / 1000) - seconds;

  if (delta < 60) {
    return "just now";
  }

  if (delta < 3600) {
    return `${Math.floor(delta / 60)}m ago`;
  }

  if (delta < 86400) {
    return `${Math.floor(delta / 3600)}h ago`;
  }

  if (delta < 604800) {
    return `${Math.floor(delta / 86400)}d ago`;
  }

  return new Date(seconds * 1000).toLocaleDateString();
}

export function formatUserInput(input: UserInput) {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
      return `Image: ${input.url}`;
    case "localImage":
      return `Local image: ${input.path}`;
    case "skill":
      return `Skill: ${input.name} (${input.path})`;
    case "mention":
      return `Mention: ${input.name} (${input.path})`;
  }
}

export function summarizePendingKinds(pendingRequests: PendingRequest[]) {
  return [...new Set(pendingRequests.map((request) => request.kind))];
}

export function matchesThreadFilter(
  thread: ThreadSummary,
  searchTerm: string,
  statusFilter: ThreadStatusFilter
) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchesSearch =
    normalizedSearch.length === 0 ||
    [
      thread.name ?? "",
      thread.preview,
      thread.cwd,
      thread.modelProvider
    ].some((value) => value.toLowerCase().includes(normalizedSearch));

  if (!matchesSearch) {
    return false;
  }

  switch (statusFilter) {
    case "all":
      return true;
    case "active":
      return thread.status.type === "active";
    case "waitingApproval":
      return (
        thread.pendingRequests.some((request) => request.kind !== "userInput") ||
        (thread.status.type === "active" &&
          thread.status.activeFlags.includes("waitingOnApproval"))
      );
    case "waitingInput":
      return (
        thread.pendingRequests.some((request) => request.kind === "userInput") ||
        (thread.status.type === "active" &&
          thread.status.activeFlags.includes("waitingOnUserInput"))
      );
    case "idle":
      return thread.status.type === "idle";
  }
}

export function groupThreadsByWorkspace(threads: ThreadSummary[]) {
  const grouped = new Map<string, ThreadSummary[]>();

  for (const thread of threads) {
    const workspace = getWorkspaceLabel(thread.cwd);
    const current = grouped.get(workspace) ?? [];
    current.push(thread);
    grouped.set(workspace, current);
  }

  return [...grouped.entries()].map(([workspace, items]) => ({
    workspace,
    items
  }));
}
