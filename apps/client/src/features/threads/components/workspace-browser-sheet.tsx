import { FolderOpen, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  useWorkspaceBrowser,
  type WorkspaceBrowserRequestedTargetKind,
} from '@/features/threads/components/use-workspace-browser';
import {
  WorkspaceBrowserPreviewPane,
  WorkspaceBrowserTreePane,
} from '@/features/threads/components/workspace-browser-panes';
import { useI18n } from '@/lib/i18n/use-i18n';

export function WorkspaceBrowserSheet({
  cwd,
  onOpenChange,
  open,
  requestKey,
  requestedLine,
  requestedPath,
  requestedTargetKind,
  threadId,
}: {
  cwd: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requestKey: number;
  requestedLine: number | null;
  requestedPath: string | null;
  requestedTargetKind: WorkspaceBrowserRequestedTargetKind;
  threadId: string;
}) {
  const { t } = useI18n();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const {
    directories,
    expandedPaths,
    filePreviewState,
    handleRetryDirectory,
    handleToggleDirectory,
    loadFile,
    mobileMode,
    selectedDirectoryPath,
    selectedFilePath,
    selectedPreviewPath,
    setMobileMode,
  } = useWorkspaceBrowser({
    isDesktop,
    open,
    requestKey,
    requestedPath,
    requestedTargetKind,
    threadId,
  });

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="inset-0 h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 bg-card/95 p-0 sm:max-w-none lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:w-full lg:max-w-[min(96vw,1120px)] lg:border-l lg:border-subtle/6"
        showCloseButton={false}
        side={isDesktop ? 'right' : 'bottom'}
      >
        <SheetHeader className="gap-2 border-b border-subtle/6 bg-background/45 px-4 py-4 md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderOpen className="size-4" />
              </div>
              <SheetTitle>{t('detail.workspace.sheetTitle')}</SheetTitle>
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
              <span className="sr-only">{t('common.close')}</span>
            </Button>
          </div>
          <p className="break-all font-mono text-[0.74rem] text-muted-foreground">
            {cwd}
          </p>
        </SheetHeader>

        {isDesktop ? (
          <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="min-h-0 border-r border-subtle/6">
              <WorkspaceBrowserTreePane
                directories={directories}
                expandedPaths={expandedPaths}
                onRetryDirectory={handleRetryDirectory}
                onSelectFile={(path) => {
                  void loadFile(path);
                }}
                onToggleDirectory={handleToggleDirectory}
                scrollRequestKey={requestKey}
                scrollTargetPath={requestedPath}
                selectedDirectoryPath={selectedDirectoryPath}
                selectedFilePath={selectedFilePath}
              />
            </div>

            <div className="min-h-0">
              <WorkspaceBrowserPreviewPane
                highlightLine={requestedLine}
                onRetry={(path) => {
                  void loadFile(path);
                }}
                state={filePreviewState}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-subtle/6 px-4 py-3">
              <Button
                onClick={() => {
                  setMobileMode('files');
                }}
                size="sm"
                type="button"
                variant={mobileMode === 'files' ? 'secondary' : 'ghost'}
              >
                {t('detail.workspace.treeTitle')}
              </Button>
              <Button
                disabled={!selectedPreviewPath}
                onClick={() => {
                  setMobileMode('preview');
                }}
                size="sm"
                type="button"
                variant={mobileMode === 'preview' ? 'secondary' : 'ghost'}
              >
                {t('detail.workspace.previewTitle')}
              </Button>
            </div>

            {mobileMode === 'files' ? (
              <div className="min-h-0 flex flex-1 flex-col">
                <WorkspaceBrowserTreePane
                  directories={directories}
                  expandedPaths={expandedPaths}
                  onRetryDirectory={handleRetryDirectory}
                  onSelectFile={(path) => {
                    void loadFile(path);
                  }}
                  onToggleDirectory={handleToggleDirectory}
                  scrollRequestKey={requestKey}
                  scrollTargetPath={requestedPath}
                  selectedDirectoryPath={selectedDirectoryPath}
                  selectedFilePath={selectedFilePath}
                />
              </div>
            ) : (
              <div className="min-h-0 flex flex-1 flex-col">
                <WorkspaceBrowserPreviewPane
                  highlightLine={requestedLine}
                  onRetry={(path) => {
                    void loadFile(path);
                  }}
                  state={filePreviewState}
                />
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
