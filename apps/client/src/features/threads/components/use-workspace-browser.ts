import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkspaceFilePreviewState } from "@/features/threads/components/workspace-file-preview";
import type { WorkspaceDirectoryState } from "@/features/threads/components/workspace-tree";
import {
  getAncestorDirectoryPaths,
  normalizeWorkspacePath
} from "@/features/threads/lib/workspace-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useBridgeClient } from "@/lib/runtime/runtime-provider";
import type { WorkspaceEntry } from "@my-codex-app/protocol";

export function useWorkspaceBrowser({
  isDesktop,
  open,
  requestKey,
  requestedPath,
  threadId
}: {
  isDesktop: boolean;
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
  const [mobileMode, setMobileMode] = useState<"files" | "preview">("files");
  const [filePreviewState, setFilePreviewState] = useState<WorkspaceFilePreviewState>({
    status: "idle"
  });
  const directoryStateRef = useRef<Record<string, WorkspaceDirectoryState>>({});
  const directoryRequestRef = useRef(new Map<string, Promise<WorkspaceEntry[]>>());
  const fileRequestIdRef = useRef(0);
  const openStateRef = useRef(open);

  const ensureDirectory = useCallback(async (directoryPath: string, force = false): Promise<WorkspaceEntry[]> => {
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
  }, [bridgeClient, t, threadId]);

  const loadFile = useCallback(async (filePath: string) => {
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
  }, [bridgeClient, isDesktop, t, threadId]);

  const openRequestedPath = useCallback(async (pathToOpen: string) => {
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
  }, [ensureDirectory, isDesktop, loadFile]);

  const handleToggleDirectory = useCallback((directoryPath: string) => {
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
  }, [ensureDirectory, expandedPaths]);

  const handleRetryDirectory = useCallback((directoryPath: string) => {
    void ensureDirectory(directoryPath, true).catch(() => {
      // Directory state already captures the failure.
    });
  }, [ensureDirectory]);

  useEffect(() => {
    directoryStateRef.current = directories;
  }, [directories]);

  useEffect(() => {
    const wasOpen = openStateRef.current;
    openStateRef.current = open;

    if (!open || wasOpen || isDesktop) {
      return;
    }

    const timer = setTimeout(() => {
      setMobileMode(requestedPath ? "preview" : "files");
    }, 0);

    return () => clearTimeout(timer);
  }, [isDesktop, open, requestedPath]);

  useEffect(() => {
    if (!open) {
      return;
    }

    queueMicrotask(() => {
      void ensureDirectory("").catch(() => {
        // Directory state already captures the failure.
      });
    });
  }, [ensureDirectory, open]);

  useEffect(() => {
    if (!open || requestedPath === null) {
      return;
    }

    queueMicrotask(() => {
      void openRequestedPath(requestedPath).catch(() => {
        // Per-path load failures are reflected in local preview/tree state.
      });
    });
  }, [open, openRequestedPath, requestKey, requestedPath]);

  const selectedPreviewPath =
    filePreviewState.status === "idle" ? selectedFilePath : filePreviewState.path;

  return {
    directories,
    expandedPaths,
    filePreviewState,
    handleRetryDirectory,
    handleToggleDirectory,
    loadFile,
    mobileMode,
    rootDirectoryLoading: !directories[""] || directories[""].status === "loading",
    selectedFilePath,
    selectedPreviewPath,
    setMobileMode
  };
}
