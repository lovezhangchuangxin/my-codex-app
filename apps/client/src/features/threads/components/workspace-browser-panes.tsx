import { ScrollArea } from '@/components/ui/scroll-area';
import {
  WorkspaceFilePreview,
  type WorkspaceFilePreviewState,
} from '@/features/threads/components/workspace-file-preview';
import {
  WorkspaceTree,
  type WorkspaceDirectoryState,
} from '@/features/threads/components/workspace-tree';

export function WorkspaceBrowserTreePane({
  directories,
  expandedPaths,
  onRetryDirectory,
  onSelectFile,
  onToggleDirectory,
  scrollRequestKey,
  scrollTargetPath,
  selectedDirectoryPath,
  selectedFilePath,
}: {
  directories: Record<string, WorkspaceDirectoryState>;
  expandedPaths: Record<string, boolean>;
  onRetryDirectory: (directoryPath: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (directoryPath: string) => void;
  scrollRequestKey: number;
  scrollTargetPath: string | null;
  selectedDirectoryPath: string | null;
  selectedFilePath: string | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
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
  state,
}: {
  highlightLine: number | null;
  onRetry: (path: string) => void;
  state: WorkspaceFilePreviewState;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
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
