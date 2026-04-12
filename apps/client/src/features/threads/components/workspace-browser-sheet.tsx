import { useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { WorkspaceFilePreview, type WorkspaceFilePreviewState } from "@/features/threads/components/workspace-file-preview";
import {
  WorkspaceTree,
  type WorkspaceDirectoryState
} from "@/features/threads/components/workspace-tree";
import {
  getAncestorDirectoryPaths,
  getFileName,
  normalizeWorkspacePath
} from "@/features/threads/lib/workspace-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useBridgeClient } from "@/lib/runtime/runtime-provider";
import { getWorkspaceLabel } from "@/features/threads/lib/thread-utils";
import type { WorkspaceEntry } from "@my-codex-app/protocol";

export function WorkspaceBrowserSheet({
  cwd,
  onOpenChange,
  open,
  requestKey,
  requestedPath,
  threadId
}: {
  cwd: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requestKey: number;
  requestedPath: string | null;
  threadId: string;
}) {
  const bridgeClient = useBridgeClient();
  const { t } = useI18n();
  const [directories, setDirectories] = useState<Record<string, WorkspaceDirectoryState>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [filePreviewState, setFilePreviewState] = useState<WorkspaceFilePreviewState>({
    status: "idle"
  });
  const directoryStateRef = useRef<Record<string, WorkspaceDirectoryState>>({});
  const directoryRequestRef = useRef(new Map<string, Promise<WorkspaceEntry[]>>());
  const fileRequestIdRef = useRef(0);

  useEffect(() => {
    directoryStateRef.current = directories;
  }, [directories]);

  useEffect(() => {
    setDirectories({});
    setExpandedPaths({});
    setSelectedFilePath(null);
    setFilePreviewState({ status: "idle" });
    directoryRequestRef.current.clear();
    fileRequestIdRef.current += 1;
  }, [threadId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void ensureDirectory("").catch(() => {
      // Directory state already captures the failure.
    });
  }, [open]);

  useEffect(() => {
    if (!open || requestedPath === null) {
      return;
    }

    void openRequestedPath(requestedPath).catch(() => {
      // Per-path load failures are reflected in local preview/tree state.
    });
  }, [open, requestKey, requestedPath]);

  async function ensureDirectory(directoryPath: string, force = false): Promise<WorkspaceEntry[]> {
    const normalizedPath = normalizeWorkspacePath(directoryPath);
    if (normalizedPath === null) {
      throw new Error(t("detail.workspace.error.invalidPath"));
    }

    if (!force) {
      const currentState = directoryStateRef.current[normalizedPath];
      if (currentState?.status === "ready") {
        return currentState.entries;
      }

      const inFlight = directoryRequestRef.current.get(normalizedPath);
      if (inFlight) {
        return inFlight;
      }
    }

    setDirectories((current) => ({
      ...current,
      [normalizedPath]: {
        status: "loading",
        entries: current[normalizedPath]?.entries ?? []
      }
    }));

    const request = bridgeClient
      .readWorkspaceDirectory({
        threadId,
        ...(normalizedPath.length > 0 ? { path: normalizedPath } : {})
      })
      .then((response) => {
        setDirectories((current) => ({
          ...current,
          [normalizedPath]: {
            status: "ready",
            entries: response.entries
          }
        }));
        return response.entries;
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : t("detail.workspace.error.directory");
        setDirectories((current) => ({
          ...current,
          [normalizedPath]: {
            status: "error",
            entries: current[normalizedPath]?.entries ?? [],
            message
          }
        }));
        return directoryStateRef.current[normalizedPath]?.entries ?? [];
      })
      .finally(() => {
        directoryRequestRef.current.delete(normalizedPath);
      });

    directoryRequestRef.current.set(normalizedPath, request);
    return request;
  }

  async function loadFile(filePath: string) {
    const normalizedPath = normalizeWorkspacePath(filePath);
    if (normalizedPath === null || normalizedPath.length === 0) {
      setFilePreviewState({
        status: "error",
        path: filePath,
        message: t("detail.workspace.error.invalidPath")
      });
      return;
    }

    const nextRequestId = fileRequestIdRef.current + 1;
    fileRequestIdRef.current = nextRequestId;
    setSelectedFilePath(normalizedPath);
    setFilePreviewState({
      status: "loading",
      path: normalizedPath
    });

    try {
      const response = await bridgeClient.readWorkspaceFile({
        threadId,
        path: normalizedPath
      });
      if (fileRequestIdRef.current !== nextRequestId) {
        return;
      }

      setFilePreviewState({
        status: "ready",
        path: normalizedPath,
        response
      });
    } catch (error) {
      if (fileRequestIdRef.current !== nextRequestId) {
        return;
      }

      setFilePreviewState({
        status: "error",
        path: normalizedPath,
        message: error instanceof Error ? error.message : t("detail.workspace.error.file")
      });
    }
  }

  async function openRequestedPath(pathToOpen: string) {
    const normalizedPath = normalizeWorkspacePath(pathToOpen);
    if (normalizedPath === null || normalizedPath.length === 0) {
      return;
    }

    await ensureDirectory("");

    const ancestorDirectories = getAncestorDirectoryPaths(normalizedPath);
    if (ancestorDirectories.length > 0) {
      setExpandedPaths((current) => {
        const nextState = { ...current };
        for (const directoryPath of ancestorDirectories) {
          nextState[directoryPath] = true;
        }
        return nextState;
      });

      for (const directoryPath of ancestorDirectories) {
        await ensureDirectory(directoryPath);
      }
    }

    await loadFile(normalizedPath);
  }

  function handleToggleDirectory(directoryPath: string) {
    const nextExpanded = expandedPaths[directoryPath] !== true;
    setExpandedPaths((current) => ({
      ...current,
      [directoryPath]: nextExpanded
    }));

    if (nextExpanded) {
      void ensureDirectory(directoryPath).catch(() => {
        // Directory state already captures the failure.
      });
    }
  }

  function handleRetryDirectory(directoryPath: string) {
    void ensureDirectory(directoryPath, true).catch(() => {
      // Directory state already captures the failure.
    });
  }

  const selectedPreviewPath =
    filePreviewState.status === "idle" ? selectedFilePath : filePreviewState.path;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full gap-0 border-l border-subtle/6 bg-card/95 p-0 sm:max-w-[min(96vw,1120px)]"
        side="right"
      >
        <SheetHeader className="gap-2 border-b border-subtle/6 bg-background/45 px-4 py-4 md:px-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderOpen className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{t("detail.workspace.sheetTitle")}</SheetTitle>
                <Badge
                  className="border-0 bg-background/80 font-mono text-[0.68rem] uppercase text-muted-foreground"
                  variant="outline"
                >
                  {getWorkspaceLabel(cwd, t)}
                </Badge>
              </div>
              <SheetDescription>{t("detail.workspace.sheetDescription")}</SheetDescription>
            </div>
          </div>
          <p className="break-all font-mono text-[0.74rem] text-muted-foreground">{cwd}</p>
        </SheetHeader>

        <div className="min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="min-h-0 border-b border-subtle/6 lg:border-r lg:border-b-0">
            <div className="flex items-center justify-between px-4 py-3 md:px-5">
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">{t("detail.workspace.treeTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("detail.workspace.treeDescription")}</p>
              </div>
              {!directories[""] || directories[""].status === "loading" ? (
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <Separator />
            <ScrollArea className="h-[38svh] lg:h-[calc(100svh-9.5rem)]">
              <WorkspaceTree
                directories={directories}
                expandedPaths={expandedPaths}
                onRetryDirectory={handleRetryDirectory}
                onSelectFile={(path) => {
                  void loadFile(path);
                }}
                onToggleDirectory={handleToggleDirectory}
                selectedFilePath={selectedFilePath}
              />
            </ScrollArea>
          </div>

          <div className="min-h-0">
            <div className="flex items-center justify-between px-4 py-3 md:px-5">
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">{t("detail.workspace.previewTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedPreviewPath
                    ? getFileName(selectedPreviewPath)
                    : t("detail.workspace.previewDescription")}
                </p>
              </div>
            </div>
            <Separator />
            <ScrollArea className="h-[calc(100svh-23rem)] lg:h-[calc(100svh-9.5rem)]">
              <WorkspaceFilePreview
                onRetry={(path) => {
                  void loadFile(path);
                }}
                state={filePreviewState}
              />
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
