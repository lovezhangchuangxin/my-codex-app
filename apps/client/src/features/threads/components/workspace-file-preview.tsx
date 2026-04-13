import { FileCode2, FileWarning, LoaderCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CodeViewer } from '@/components/common/code-viewer';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageParams } from '@/lib/i18n/types';
import type { WorkspaceReadFileResponse } from '@my-codex-app/protocol';

import {
  formatFileSize,
  getFileName,
  inferCodeLanguageFromPath,
} from '@/features/threads/lib/workspace-utils';

export type WorkspaceFilePreviewState =
  | { status: 'idle' }
  | { status: 'loading'; path: string }
  | { status: 'error'; path: string; message: string }
  | { status: 'ready'; path: string; response: WorkspaceReadFileResponse };

export function WorkspaceFilePreview({
  highlightLine,
  onRetry,
  state,
}: {
  highlightLine?: number | null;
  onRetry: (path: string) => void;
  state: WorkspaceFilePreviewState;
}) {
  const { t } = useI18n();

  if (state.status === 'idle') {
    return (
      <EmptyPreviewState
        description={t('detail.workspace.preview.empty')}
        title={t('detail.workspace.preview.title')}
      />
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-3 p-4 md:p-5">
        <PreviewHeader
          metadata={t('detail.workspace.loading.file')}
          path={state.path}
          title={getFileName(state.path)}
        />
        <div className="grid min-h-[14rem] place-items-center rounded-2xl border border-subtle/8 bg-background/55">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            <span>{t('detail.workspace.loading.file')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-3 p-4 md:p-5">
        <PreviewHeader path={state.path} title={getFileName(state.path)} />
        <Alert className="border-destructive/20 bg-destructive/5">
          <AlertTitle>{t('detail.workspace.error.fileTitle')}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
        <Button
          onClick={() => {
            onRetry(state.path);
          }}
          size="sm"
          variant="outline"
        >
          {t('detail.workspace.action.retry')}
        </Button>
      </div>
    );
  }

  const fileName = getFileName(state.response.path);
  const fileSize = formatFileSize(state.response.sizeBytes);
  const language = inferCodeLanguageFromPath(state.response.path);

  return (
    <div className="space-y-3 p-4 md:p-5">
      <PreviewHeader
        badge={
          state.response.kind !== 'text'
            ? workspaceFileKindBadge(state.response.kind, t)
            : undefined
        }
        metadata={[
          fileSize,
          state.response.modifiedAtMs
            ? t('detail.workspace.updated', {
                value: new Date(state.response.modifiedAtMs).toLocaleString(),
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        path={state.response.path}
        title={fileName}
      />

      {state.response.kind === 'text' ? (
        <CodeViewer
          className="min-h-[18rem] rounded-lg border border-subtle/8 bg-code-bg"
          highlightLine={highlightLine}
          {...(language ? { language } : {})}
        >
          {state.response.content ?? ''}
        </CodeViewer>
      ) : (
        <div className="rounded-lg border border-subtle/8 bg-background/55 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-secondary/10 p-2 text-secondary">
              <FileWarning className="size-4" />
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">
                {workspaceFileKindMessage(state.response.kind, t)}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {t('detail.workspace.preview.metadataOnly')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyPreviewState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="grid min-h-[18rem] place-items-center p-4 md:p-5">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileCode2 className="size-5" />
        </div>
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewHeader({
  badge,
  metadata,
  path,
  title,
}: {
  badge?: string | undefined;
  metadata?: string | undefined;
  path: string;
  title: string;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 truncate font-heading text-[1.02rem] tracking-[-0.03em] text-foreground">
          {title}
        </h3>
        {badge ? (
          <Badge
            className="h-auto border-0 bg-background/80 font-mono text-[0.68rem] uppercase text-muted-foreground"
            variant="outline"
          >
            {badge}
          </Badge>
        ) : null}
      </div>
      <p className="break-all font-mono text-[0.74rem] text-muted-foreground">
        {t('detail.workspace.path')}: {path}
      </p>
      {metadata ? (
        <p className="text-xs text-muted-foreground">{metadata}</p>
      ) : null}
    </div>
  );
}

function workspaceFileKindBadge(
  kind: WorkspaceReadFileResponse['kind'],
  t: (key: string, values?: MessageParams) => string,
) {
  switch (kind) {
    case 'text':
      return t('detail.workspace.kind.text');
    case 'binary':
      return t('detail.workspace.kind.binary');
    case 'tooLarge':
      return t('detail.workspace.kind.tooLarge');
    case 'unsupported':
      return t('detail.workspace.kind.unsupported');
  }
}

function workspaceFileKindMessage(
  kind: WorkspaceReadFileResponse['kind'],
  t: (key: string, values?: MessageParams) => string,
) {
  switch (kind) {
    case 'text':
      return t('detail.workspace.kind.text');
    case 'binary':
      return t('detail.workspace.preview.binary');
    case 'tooLarge':
      return t('detail.workspace.preview.tooLarge');
    case 'unsupported':
      return t('detail.workspace.preview.unsupported');
  }
}
