import { LoaderCircle } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { WorkspaceFilePreview, type WorkspaceFilePreviewState } from "@/features/threads/components/workspace-file-preview";
import {
  WorkspaceTree,
  type WorkspaceDirectoryState
} from "@/features/threads/components/workspace-tree";
import { getFileName } from "@/features/threads/lib/workspace-utils";
import { useI18n } from "@/lib/i18n/use-i18n";

export function WorkspaceBrowserTreePane({
  directories,
  expandedPaths,
  onRetryDirectory,
  onSelectFile,
  onToggleDirectory,
  rootDirectoryLoading,
  scrollRequestKey,
  scrollTargetPath,
  selectedDirectoryPath,
  selectedFilePath
}: {
  directories: Record<string, WorkspaceDirectoryState>;
  expandedPaths: Record<string, boolean>;
  onRetryDirectory: (directoryPath: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (directoryPath: string) => void;
  rootDirectoryLoading: boolean;
  scrollRequestKey: number;
  scrollTargetPath: string | null;
  selectedDirectoryPath: string | null;
  selectedFilePath: string | null;
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 py-3 md:px-5">
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">{t("detail.workspace.treeTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("detail.workspace.treeDescription")}</p>
        </div>
        {rootDirectoryLoading ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <WorkspaceTree
          directories={directories}
          expandedPaths={expandedPaths}
          onRetryDirectory={onRetryDirectory}
          onSelectFile={onSelectFile}
          onToggleDirectory={onToggleDirectory}
          scrollRequestKey={scrollRequestKey}
          scrollTargetPath={scrollTargetPath}
          selectedDirectoryPath={selectedDirectoryPath}
          selectedFilePath={selectedFilePath}
        />
      </ScrollArea>
    </div>
  );
}

export function WorkspaceBrowserPreviewPane({
  highlightLine,
  onRetry,
  selectedPreviewPath,
  state
}: {
  highlightLine: number | null;
  onRetry: (path: string) => void;
  selectedPreviewPath: string | null;
  state: WorkspaceFilePreviewState;
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 py-3 md:px-5">
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
          highlightLine={highlightLine}
          onRetry={onRetry}
          state={state}
        />
      </ScrollArea>
    </div>
  );
}
