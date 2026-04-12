import { useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
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
  requestedLine,
  requestedPath,
  threadId
}: {
  cwd: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requestKey: number;
  requestedLine: number | null;
  requestedPath: string | null;
  threadId: string;
}) {
  const bridgeClient = useBridgeClient();
  const { t } = useI18n();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [directories, setDirectories] = useState<Record<string, WorkspaceDirectoryState>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<"files" | "preview">("files");
  const [filePreviewState, setFilePreviewState] = useState<WorkspaceFilePreviewState>({
    status: "idle"
  });
  const directoryStateRef = useRef<Record<string, WorkspaceDirectoryState>>({});
  const directoryRequestRef = useRef(new Map<string, Promise<WorkspaceEntry[]>>());
  const fileRequestIdRef = useRef(0);
  const openStateRef = useRef(open);

  useEffect(() => {
    directoryStateRef.current = directories;
  }, [directories]);

  useEffect(() => {
    setDirectories({});
    setExpandedPaths({});
    setSelectedFilePath(null);
    setMobileMode("files");
    setFilePreviewState({ status: "idle" });
    directoryRequestRef.current.clear();
    fileRequestIdRef.current += 1;
  }, [threadId]);

  useEffect(() => {
    const wasOpen = openStateRef.current;
    openStateRef.current = open;

    if (!open || wasOpen || isDesktop) {
      return;
    }

    setMobileMode(requestedPath ? "preview" : "files");
  }, [isDesktop, open, requestedPath]);

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

    if (!isDesktop) {
      setMobileMode("preview");
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

    if (!isDesktop) {
      setMobileMode("preview");
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
        className="inset-0 h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 bg-card/95 p-0 sm:max-w-none lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:w-full lg:max-w-[min(96vw,1120px)] lg:border-l lg:border-subtle/6"
        side={isDesktop ? "right" : "bottom"}
        showCloseButton={false}
      >
        <SheetHeader className="gap-2 border-b border-subtle/6 bg-background/45 px-4 py-4 md:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
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
            <Button
              onClick={() => {
                onOpenChange(false);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
              <span className="sr-only">{t("common.close")}</span>
            </Button>
          </div>
          <p className="break-all font-mono text-[0.74rem] text-muted-foreground">{cwd}</p>
        </SheetHeader>

        {isDesktop ? (
          <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="min-h-0 border-r border-subtle/6">
              <div className="flex h-full min-h-0 flex-col">
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
                <ScrollArea className="min-h-0 flex-1">
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
            </div>

            <div className="min-h-0">
              <div className="flex h-full min-h-0 flex-col">
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
                <ScrollArea className="min-h-0 flex-1">
                  <WorkspaceFilePreview
                    highlightLine={requestedLine}
                    onRetry={(path) => {
                      void loadFile(path);
                    }}
                    state={filePreviewState}
                  />
                </ScrollArea>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-subtle/6 px-4 py-3">
              <Button
                onClick={() => {
                  setMobileMode("files");
                }}
                size="sm"
                type="button"
                variant={mobileMode === "files" ? "secondary" : "ghost"}
              >
                {t("detail.workspace.treeTitle")}
              </Button>
              <Button
                disabled={!selectedPreviewPath}
                onClick={() => {
                  setMobileMode("preview");
                }}
                size="sm"
                type="button"
                variant={mobileMode === "preview" ? "secondary" : "ghost"}
              >
                {t("detail.workspace.previewTitle")}
              </Button>
            </div>

            {mobileMode === "files" ? (
              <div className="min-h-0 flex flex-1 flex-col">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">{t("detail.workspace.treeTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("detail.workspace.treeDescription")}</p>
                  </div>
                  {!directories[""] || directories[""].status === "loading" ? (
                    <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                <Separator />
                <ScrollArea className="min-h-0 flex-1">
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
            ) : (
              <div className="min-h-0 flex flex-1 flex-col">
                <div className="px-4 py-3">
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
                <ScrollArea className="min-h-0 flex-1">
                  <WorkspaceFilePreview
                    highlightLine={requestedLine}
                    onRetry={(path) => {
                      void loadFile(path);
                    }}
                    state={filePreviewState}
                  />
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
