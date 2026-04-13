import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PendingRequestList } from "@/features/requests/components/pending-request-list";
import type { PendingRequestEntry } from "@/features/requests/lib/request-utils";
import { useRequestDrafts } from "@/features/requests/lib/use-request-drafts";
import { ThreadComposer } from "@/features/threads/components/thread-detail-composer";
import { ThreadDetailEmptyState } from "@/features/threads/components/thread-detail-empty-state";
import { ThreadDetailHeader } from "@/features/threads/components/thread-detail-header";
import { ThreadMessageStream } from "@/features/threads/components/thread-detail-messages";
import { ThreadSwitcherSheet } from "@/features/threads/components/thread-switcher-sheet";
import { parseFilePathWithLine } from "@/features/threads/components/thread-detail-utils";
import type { WorkspaceBrowserRequestedTargetKind } from "@/features/threads/components/use-workspace-browser";
import { useThreadDetailBanner } from "@/features/threads/components/use-thread-detail-banner";
import { WorkspaceBrowserSheet } from "@/features/threads/components/workspace-browser-sheet";
import { useAutoScroll } from "@/features/threads/lib/use-auto-scroll";
import { flattenTurnItems } from "@/features/threads/lib/thread-utils";
import { toWorkspaceRelativePath } from "@/features/threads/lib/workspace-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { ThreadDetailState, ThreadListState } from "@my-codex-app/sdk";
import { findActiveTurnId } from "@my-codex-app/sdk";
import type {
  LocalConnectionState,
  RequestRespondRequest,
  ThreadDetail,
  ThreadReviewRequest,
  ThreadTurnSettingsOverrides
} from "@my-codex-app/protocol";

export function ThreadDetailPanel({
  connectionState,
  compactPending,
  detailState,
  highlightedRequestKey,
  interruptPending,
  isDesktop,
  lastError,
  onBack,
  onCompactThread,
  onCreateThread,
  onOpenThread,
  onRenameThread,
  onRespondToRequest,
  onSendMessage,
  onInterrupt,
  onStartReview,
  respondingRequestIds,
  selectedThreadId,
  sendMessagePending,
  threadsState
}: {
  connectionState: LocalConnectionState;
  compactPending: boolean;
  detailState: ThreadDetailState;
  highlightedRequestKey: string | null | undefined;
  interruptPending: boolean;
  isDesktop: boolean;
  lastError: string | null;
  onBack: () => void;
  onCompactThread: (threadId: string) => Promise<boolean>;
  onCreateThread: (projectPath: string) => Promise<boolean>;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onRenameThread: (threadId: string, name: string) => Promise<boolean>;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  onSendMessage: (
    threadId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides
  ) => Promise<boolean>;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  onStartReview: (request: ThreadReviewRequest) => Promise<boolean>;
  respondingRequestIds: Array<string | number>;
  selectedThreadId: string | null;
  sendMessagePending: boolean;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();

  if (detailState.kind === "idle") {
    return (
      <ThreadDetailEmptyState
        message={t("detail.empty.noThread.message")}
        title={t("detail.empty.noThread.title")}
      />
    );
  }

  if (detailState.kind === "loading") {
    return (
      <Card className="h-full rounded-none bg-card/65">
        <CardContent className="space-y-4 pt-5">
          <div className="h-10 w-48 rounded-full bg-muted/70" />
          <div className="h-5 w-full rounded-full bg-muted/70" />
          <div className="h-5 w-5/6 rounded-full bg-muted/70" />
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="h-24 rounded-[18px] border border-border/60 bg-background/70" key={index} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (detailState.kind === "error") {
    return (
      <Card className="h-full rounded-none bg-destructive/6">
        <CardContent className="space-y-4 pt-5">
          {!isDesktop ? (
            <Button onClick={onBack} size="sm" variant="ghost">
              <ArrowLeft className="size-4" />
              {t("detail.action.backToThreads")}
            </Button>
          ) : null}
          <Alert className="border-destructive/20 bg-transparent">
            <AlertTitle>{t("detail.error.loadTitle")}</AlertTitle>
            <AlertDescription>{detailState.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <ReadyThreadDetail
      connectionState={connectionState}
      compactPending={compactPending}
      highlightedRequestKey={highlightedRequestKey}
      interruptPending={interruptPending}
      isDesktop={isDesktop}
      key={detailState.thread.id}
      lastError={lastError}
      onBack={onBack}
      onCompactThread={onCompactThread}
      onCreateThread={onCreateThread}
      onInterrupt={onInterrupt}
      onOpenThread={onOpenThread}
      onRenameThread={onRenameThread}
      onRespondToRequest={onRespondToRequest}
      onSendMessage={onSendMessage}
      onStartReview={onStartReview}
      respondingRequestIds={respondingRequestIds}
      selectedThreadId={selectedThreadId}
      sendMessagePending={sendMessagePending}
      thread={detailState.thread}
      threadsState={threadsState}
    />
  );
}

function ReadyThreadDetail({
  connectionState,
  compactPending,
  highlightedRequestKey,
  interruptPending,
  isDesktop,
  lastError,
  onBack,
  onCompactThread,
  onCreateThread,
  onInterrupt,
  onOpenThread,
  onRenameThread,
  onRespondToRequest,
  onSendMessage,
  onStartReview,
  respondingRequestIds,
  selectedThreadId,
  sendMessagePending,
  thread,
  threadsState
}: {
  connectionState: LocalConnectionState;
  compactPending: boolean;
  highlightedRequestKey: string | null | undefined;
  interruptPending: boolean;
  isDesktop: boolean;
  lastError: string | null;
  onBack: () => void;
  onCompactThread: (threadId: string) => Promise<boolean>;
  onCreateThread: (projectPath: string) => Promise<boolean>;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onRenameThread: (threadId: string, name: string) => Promise<boolean>;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  onSendMessage: (
    threadId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides
  ) => Promise<boolean>;
  onStartReview: (request: ThreadReviewRequest) => Promise<boolean>;
  respondingRequestIds: Array<string | number>;
  selectedThreadId: string | null;
  sendMessagePending: boolean;
  thread: ThreadDetail;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();
  const drafts = useRequestDrafts();
  const activeTurnId = findActiveTurnId(thread);
  const actionsEnabled = connectionState.kind === "authenticated";
  const banner = useThreadDetailBanner(connectionState, t);
  const pendingEntries: PendingRequestEntry[] = thread.pendingRequests.map((request) => ({
    request,
    thread
  }));
  const flatItems = flattenTurnItems(thread.turns);
  const scrollRef = useAutoScroll<HTMLDivElement>([flatItems.length, thread.updatedAt]);
  const [threadSwitcherOpen, setThreadSwitcherOpen] = useState(false);
  const [workspaceBrowserState, setWorkspaceBrowserState] = useState<{
    open: boolean;
    requestedPath: string | null;
    requestedLine: number | null;
    requestedTargetKind: WorkspaceBrowserRequestedTargetKind;
    requestKey: number;
  }>({
    open: false,
    requestedLine: null,
    requestedPath: null,
    requestedTargetKind: "auto",
    requestKey: 0
  });

  function resolveWorkspacePath(candidatePath: string): string | null {
    return toWorkspaceRelativePath(thread.cwd, candidatePath);
  }

  function openWorkspaceBrowser(
    requestedPath: string | null = null,
    requestedLine: number | null = null,
    requestedTargetKind: WorkspaceBrowserRequestedTargetKind = "auto"
  ) {
    setWorkspaceBrowserState((current) => ({
      open: true,
      requestedLine,
      requestedPath,
      requestedTargetKind,
      requestKey: current.requestKey + 1
    }));
  }

  const handleFilePathClick = useCallback(
    (href: string) => {
      const { line, path } = parseFilePathWithLine(href);
      const workspacePath = toWorkspaceRelativePath(thread.cwd, path);
      if (workspacePath !== null) {
        setWorkspaceBrowserState((current) => ({
          open: true,
          requestedLine: line,
          requestedPath: workspacePath,
          requestedTargetKind: line !== null ? "file" : "auto",
          requestKey: current.requestKey + 1
        }));
      }
    },
    [thread.cwd]
  );

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-none bg-card/68 py-0">
      <ThreadDetailHeader
        isDesktop={isDesktop}
        onBack={onBack}
        onOpenThreadSwitcher={() => {
          setThreadSwitcherOpen(true);
        }}
        onOpenWorkspace={() => {
          openWorkspaceBrowser();
        }}
        thread={thread}
      />

      {banner ? (
        <div className="shrink-0 px-4 pt-3 md:px-5">
          <Alert className={banner.tone === "error" ? "border-destructive/20 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
            <AlertTitle>{banner.title}</AlertTitle>
            <AlertDescription>{banner.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {lastError ? (
        <div className="shrink-0 px-4 pt-3 md:px-5">
          <Alert className="border-destructive/20 bg-destructive/5">
            <AlertTitle>{t("detail.alert.latestClientError")}</AlertTitle>
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {pendingEntries.length > 0 ? (
        <div className="shrink-0 space-y-3 border-b border-subtle/6 px-4 py-4 md:px-5">
          <PendingRequestList
            entries={pendingEntries}
            getDraft={drafts.getDraft}
            highlightedRequestKey={highlightedRequestKey}
            onOpenThread={onOpenThread}
            onRespondToRequest={async (request) => {
              const resolved = await onRespondToRequest(request);
              if (resolved) {
                drafts.clearRequest(request.requestId);
              }
              return resolved;
            }}
            respondingRequestIds={respondingRequestIds}
            setDraft={drafts.setDraft}
            showThreadContext={false}
          />
        </div>
      ) : null}

      {flatItems.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
          <ThreadDetailEmptyState
            message={t("detail.empty.noMessages.message")}
            title={t("detail.empty.noMessages.title")}
          />
        </div>
      ) : (
        <ThreadMessageStream
          flatItems={flatItems}
          onFilePathClick={handleFilePathClick}
          onOpenWorkspacePath={(path, requestedTargetKind) => {
            openWorkspaceBrowser(path, null, requestedTargetKind);
          }}
          resolveWorkspacePath={resolveWorkspacePath}
          scrollRef={scrollRef}
        />
      )}

      <div className="shrink-0 border-t border-subtle/6 bg-background/82 px-4 py-3 backdrop-blur-xl md:px-5">
        <ThreadComposer
          actionsEnabled={actionsEnabled}
          activeTurnId={activeTurnId}
          compactPending={compactPending}
          interruptPending={interruptPending}
          isDesktop={isDesktop}
          onCompactThread={onCompactThread}
          onCreateThread={onCreateThread}
          onInterrupt={onInterrupt}
          onOpenThreadSwitcher={() => {
            setThreadSwitcherOpen(true);
          }}
          onRenameThread={onRenameThread}
          onSendMessage={onSendMessage}
          onStartReview={onStartReview}
          sendMessagePending={sendMessagePending}
          thread={thread}
        />
      </div>

      <ThreadSwitcherSheet
        isDesktop={isDesktop}
        onOpenChange={setThreadSwitcherOpen}
        onOpenThread={(threadId) => {
          onOpenThread(threadId);
        }}
        open={threadSwitcherOpen}
        selectedThreadId={selectedThreadId}
        threadsState={threadsState}
      />

      <WorkspaceBrowserSheet
        cwd={thread.cwd}
        onOpenChange={(nextOpen) => {
          setWorkspaceBrowserState((current) => ({
            ...current,
            open: nextOpen
          }));
        }}
        open={workspaceBrowserState.open}
        requestKey={workspaceBrowserState.requestKey}
        requestedLine={workspaceBrowserState.requestedLine}
        requestedPath={workspaceBrowserState.requestedPath}
        requestedTargetKind={workspaceBrowserState.requestedTargetKind}
        threadId={thread.id}
      />
    </Card>
  );
}
