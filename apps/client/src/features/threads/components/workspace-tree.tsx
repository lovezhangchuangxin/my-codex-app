import { ChevronRight, FileCode2, Folder, FolderOpen, LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { WorkspaceEntry } from "@my-codex-app/protocol";

export interface WorkspaceDirectoryState {
  status: "idle" | "loading" | "ready" | "error";
  entries: WorkspaceEntry[];
  message?: string;
}

export function WorkspaceTree({
  directories,
  expandedPaths,
  onRetryDirectory,
  onSelectFile,
  onToggleDirectory,
  selectedFilePath
}: {
  directories: Record<string, WorkspaceDirectoryState>;
  expandedPaths: Record<string, boolean>;
  onRetryDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  selectedFilePath: string | null;
}) {
  const { t } = useI18n();
  const rootState = directories[""];

  if (!rootState || rootState.status === "idle" || rootState.status === "loading") {
    return <TreeStateMessage icon={<LoaderCircle className="size-4 animate-spin" />} message={t("detail.workspace.loading.directory")} />;
  }

  if (rootState.status === "error") {
    return (
      <TreeStateMessage
        action={
          <Button
            onClick={() => {
              onRetryDirectory("");
            }}
            size="xs"
            variant="outline"
          >
            {t("detail.workspace.action.retry")}
          </Button>
        }
        icon={<TriangleAlert className="size-4 text-destructive" />}
        message={rootState.message ?? t("detail.workspace.error.directory")}
      />
    );
  }

  if (rootState.entries.length === 0) {
    return <TreeStateMessage icon={<Folder className="size-4" />} message={t("detail.workspace.empty.directory")} />;
  }

  return (
    <div className="space-y-1 p-3">
      <WorkspaceTreeEntries
        depth={0}
        directories={directories}
        entries={rootState.entries}
        expandedPaths={expandedPaths}
        onRetryDirectory={onRetryDirectory}
        onSelectFile={onSelectFile}
        onToggleDirectory={onToggleDirectory}
        selectedFilePath={selectedFilePath}
      />
    </div>
  );
}

function WorkspaceTreeEntries({
  depth,
  directories,
  entries,
  expandedPaths,
  onRetryDirectory,
  onSelectFile,
  onToggleDirectory,
  selectedFilePath
}: {
  depth: number;
  directories: Record<string, WorkspaceDirectoryState>;
  entries: WorkspaceEntry[];
  expandedPaths: Record<string, boolean>;
  onRetryDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  selectedFilePath: string | null;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-1">
      {entries.map((entry) => {
        const expanded = entry.isDirectory ? expandedPaths[entry.path] === true : false;
        const childState = entry.isDirectory ? directories[entry.path] : null;
        const selected = !entry.isDirectory && selectedFilePath === entry.path;

        return (
          <div key={entry.path} className="space-y-1">
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                selected && "bg-primary/10 text-primary hover:bg-primary/12"
              )}
              onClick={() => {
                if (entry.isDirectory) {
                  onToggleDirectory(entry.path);
                  return;
                }

                onSelectFile(entry.path);
              }}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              type="button"
            >
              {entry.isDirectory ? (
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-90"
                  )}
                />
              ) : (
                <span className="block size-3.5 shrink-0" />
              )}
              {entry.isDirectory ? (
                expanded ? (
                  <FolderOpen className="size-4 shrink-0 text-primary" />
                ) : (
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                )
              ) : (
                <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 truncate text-sm">{entry.name}</span>
            </button>

            {entry.isDirectory && expanded ? (
              <div className="space-y-1">
                {!childState || childState.status === "idle" || childState.status === "loading" ? (
                  <InlineStateMessage
                    depth={depth + 1}
                    icon={<LoaderCircle className="size-3.5 animate-spin" />}
                    message={t("detail.workspace.loading.directory")}
                  />
                ) : childState.status === "error" ? (
                  <InlineStateMessage
                    action={
                      <Button
                        onClick={() => {
                          onRetryDirectory(entry.path);
                        }}
                        size="xs"
                        variant="ghost"
                      >
                        {t("detail.workspace.action.retry")}
                      </Button>
                    }
                    depth={depth + 1}
                    icon={<TriangleAlert className="size-3.5 text-destructive" />}
                    message={childState.message ?? t("detail.workspace.error.directory")}
                  />
                ) : childState.entries.length === 0 ? (
                  <InlineStateMessage
                    depth={depth + 1}
                    icon={<Folder className="size-3.5" />}
                    message={t("detail.workspace.empty.directory")}
                  />
                ) : (
                  <WorkspaceTreeEntries
                    depth={depth + 1}
                    directories={directories}
                    entries={childState.entries}
                    expandedPaths={expandedPaths}
                    onRetryDirectory={onRetryDirectory}
                    onSelectFile={onSelectFile}
                    onToggleDirectory={onToggleDirectory}
                    selectedFilePath={selectedFilePath}
                  />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TreeStateMessage({
  action,
  icon,
  message
}: {
  action?: import("react").ReactNode;
  icon: import("react").ReactNode;
  message: string;
}) {
  return (
    <div className="grid min-h-[14rem] place-items-center p-4">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-background/70 text-muted-foreground">
          {icon}
        </div>
        <div className="space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
          {action}
        </div>
      </div>
    </div>
  );
}

function InlineStateMessage({
  action,
  depth,
  icon,
  message
}: {
  action?: import("react").ReactNode;
  depth: number;
  icon: import("react").ReactNode;
  message: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-muted-foreground"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{message}</span>
      {action}
    </div>
  );
}
