import type {
  PendingRequest,
  ThreadItem,
  ThreadRuntimeStatus,
  ThreadSummary,
  TurnDetail,
  UserInput
} from "@my-codex-app/protocol";
import type { AppLocale } from "@/lib/i18n/types";
import { formatDateTime, formatRelativeTime as formatLocalizedRelativeTime } from "@/lib/i18n/formatters";
import { translateEnglish } from "@/lib/i18n/catalog";

export type FlatThreadItem = ThreadItem & {
  turnId: string;
  turnIndex: number;
  isFirstInTurn: boolean;
};

export type ThreadStatusFilter =
  | "all"
  | "active"
  | "waitingApproval"
  | "waitingInput"
  | "idle";

export function buildThreadTitle(
  thread: Pick<ThreadSummary, "name" | "preview" | "id">,
  t: (key: string) => string = translateEnglish
) {
  return (thread.name ?? thread.preview) || t("thread.title.untitled");
}

export function getWorkspaceLabel(
  cwd: string,
  t: (key: string) => string = translateEnglish
) {
  const trimmed = cwd.trim();
  if (trimmed.length === 0) {
    return t("thread.workspace.unknown");
  }

  const segments = trimmed.split(/[/\\]+/).filter(Boolean);
  return segments.at(-1) ?? trimmed;
}

export function formatStatusLabel(
  status: ThreadRuntimeStatus,
  t: (key: string) => string = translateEnglish
) {
  if (status.type !== "active") {
    switch (status.type) {
      case "idle":
        return t("thread.status.idle");
      case "notLoaded":
        return t("thread.status.notLoaded");
      case "systemError":
        return t("thread.status.systemError");
    }
  }

  if (status.activeFlags.includes("waitingOnApproval")) {
    return t("thread.status.waitingApproval");
  }

  if (status.activeFlags.includes("waitingOnUserInput")) {
    return t("thread.status.waitingInput");
  }

  return t("thread.status.active");
}

export function getStatusTone(status: ThreadRuntimeStatus) {
  if (status.type === "systemError") {
    return "error";
  }

  if (status.type === "active" && status.activeFlags.includes("waitingOnApproval")) {
    return "waitingApproval";
  }

  if (status.type === "active" && status.activeFlags.includes("waitingOnUserInput")) {
    return "waitingInput";
  }

  if (status.type === "active") {
    return "active";
  }

  return "neutral";
}

export function formatTimestamp(
  value: number | undefined,
  locale: AppLocale = "en",
  t: (key: string) => string = translateEnglish
) {
  return formatDateTime(locale, value, t);
}

export function formatRelativeTime(
  seconds: number,
  locale: AppLocale = "en",
  t: (key: string) => string = translateEnglish
) {
  return formatLocalizedRelativeTime(locale, seconds, t);
}

export function formatUserInput(
  input: UserInput,
  t: (key: string) => string = translateEnglish
) {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
      return `${t("detail.userInput.image")}: ${input.url}`;
    case "localImage":
      return `${t("detail.userInput.localImage")}: ${input.path}`;
    case "skill":
      return `${t("detail.userInput.skill")}: ${input.name} (${input.path})`;
    case "mention":
      return `${t("detail.userInput.mention")}: ${input.name} (${input.path})`;
  }
}

export function summarizePendingKinds(pendingRequests: PendingRequest[]) {
  return [...new Set(pendingRequests.map((request) => request.kind))];
}

export function countThreadsByFilter(threads: ThreadSummary[], statusFilter: ThreadStatusFilter) {
  return threads.filter((thread) => matchesThreadFilter(thread, "", statusFilter)).length;
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

export function groupThreadsByWorkspace(
  threads: ThreadSummary[],
  t: (key: string) => string = translateEnglish
) {
  const grouped = new Map<string, ThreadSummary[]>();

  for (const thread of threads) {
    const workspace = getWorkspaceLabel(thread.cwd, t);
    const current = grouped.get(workspace) ?? [];
    current.push(thread);
    grouped.set(workspace, current);
  }

  return [...grouped.entries()].map(([workspace, items]) => ({
    workspace,
    items
  }));
}

export function flattenTurnItems(turns: TurnDetail[]): FlatThreadItem[] {
  const items: FlatThreadItem[] = [];

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex++) {
    const turn = turns[turnIndex]!;
    for (let itemIndex = 0; itemIndex < turn.items.length; itemIndex++) {
      const base = turn.items[itemIndex]!;
      items.push({
        ...base,
        turnId: turn.id,
        turnIndex,
        isFirstInTurn: itemIndex === 0
      });
    }
  }

  return items;
}
