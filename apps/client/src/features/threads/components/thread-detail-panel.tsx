import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileCode2,
  FolderOpen,
  GalleryHorizontal,
  PanelLeftOpen,
  Search,
  Send,
  Sparkles,
  Square,
  SquareTerminal
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PendingRequestList } from "@/features/requests/components/pending-request-list";
import type { PendingRequestEntry } from "@/features/requests/lib/request-utils";
import { useRequestDrafts } from "@/features/requests/lib/use-request-drafts";
import { WorkspaceBrowserSheet } from "@/features/threads/components/workspace-browser-sheet";
import { useAutoScroll } from "@/features/threads/lib/use-auto-scroll";
import {
  buildThreadTitle,
  flattenTurnItems,
  formatStatusLabel,
  getStatusTone
} from "@/features/threads/lib/thread-utils";
import type { FlatThreadItem } from "@/features/threads/lib/thread-utils";
import { toWorkspaceRelativePath } from "@/features/threads/lib/workspace-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useBridgeClient } from "@/lib/runtime/runtime-provider";
import { cn } from "@/lib/utils";
import type { ThreadDetailState, ThreadListState } from "@my-codex-app/sdk";
import { findActiveTurnId } from "@my-codex-app/sdk";
import type {
  AvailableModel,
  LocalConnectionState,
  ReasoningEffort,
  RequestRespondRequest,
  ThreadDetail,
  ThreadItem,
  ThreadPermissionPresetId,
  ThreadSettings,
  ThreadTurnSettingsOverrides
} from "@my-codex-app/protocol";

const LazyMarkdownContent = lazy(async () => {
  const module = await import("@/components/common/markdown-content");
  return { default: module.MarkdownContent };
});

const LazyCodeBlock = lazy(async () => {
  const module = await import("@/components/common/code-block");
  return { default: module.CodeBlock };
});

const LazyTerminalOutput = lazy(async () => {
  const module = await import("@/components/common/terminal-output");
  return { default: module.TerminalOutput };
});

// ---------------------------------------------------------------------------
// Entry: ThreadDetailPanel
// ---------------------------------------------------------------------------

export function ThreadDetailPanel({
  connectionState,
  detailState,
  highlightedRequestKey,
  interruptPending,
  isDesktop,
  lastError,
  onBack,
  onOpenThread,
  onRespondToRequest,
  onSendMessage,
  onInterrupt,
  respondingRequestIds,
  selectedThreadId,
  sendMessagePending,
  threadsState
}: {
  connectionState: LocalConnectionState;
  detailState: ThreadDetailState;
  highlightedRequestKey: string | null | undefined;
  interruptPending: boolean;
  isDesktop: boolean;
  lastError: string | null;
  onBack: () => void;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  onSendMessage: (
    threadId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides
  ) => Promise<boolean>;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  respondingRequestIds: Array<string | number>;
  selectedThreadId: string | null;
  sendMessagePending: boolean;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();

  if (detailState.kind === "idle") {
    return (
      <EmptyDetailState
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
      key={detailState.thread.id}
      highlightedRequestKey={highlightedRequestKey}
      interruptPending={interruptPending}
      isDesktop={isDesktop}
      lastError={lastError}
      onBack={onBack}
      onOpenThread={onOpenThread}
      onRespondToRequest={onRespondToRequest}
      onSendMessage={onSendMessage}
      onInterrupt={onInterrupt}
      respondingRequestIds={respondingRequestIds}
      selectedThreadId={selectedThreadId}
      sendMessagePending={sendMessagePending}
      thread={detailState.thread}
      threadsState={threadsState}
    />
  );
}

// ---------------------------------------------------------------------------
// Main: ReadyThreadDetail
// ---------------------------------------------------------------------------

function ReadyThreadDetail({
  connectionState,
  highlightedRequestKey,
  interruptPending,
  isDesktop,
  lastError,
  onBack,
  onOpenThread,
  onRespondToRequest,
  onSendMessage,
  onInterrupt,
  respondingRequestIds,
  selectedThreadId,
  sendMessagePending,
  thread,
  threadsState
}: {
  connectionState: LocalConnectionState;
  highlightedRequestKey: string | null | undefined;
  interruptPending: boolean;
  isDesktop: boolean;
  lastError: string | null;
  onBack: () => void;
  onOpenThread: (threadId: string, requestKey?: string) => void;
  onRespondToRequest: (request: RequestRespondRequest) => Promise<boolean>;
  onSendMessage: (
    threadId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides
  ) => Promise<boolean>;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
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
  const banner = useDeferredBanner(connectionState, t);
  const pendingEntries: PendingRequestEntry[] = thread.pendingRequests.map((request) => ({
    request,
    thread
  }));
  const flatItems = flattenTurnItems(thread.turns);
  const scrollRef = useAutoScroll<HTMLDivElement>([flatItems.length, thread.updatedAt]);
  const [workspaceBrowserState, setWorkspaceBrowserState] = useState<{
    open: boolean;
    requestedPath: string | null;
    requestedLine: number | null;
    requestKey: number;
  }>({
    open: false,
    requestedPath: null,
    requestedLine: null,
    requestKey: 0
  });

  function resolveWorkspacePath(candidatePath: string): string | null {
    return toWorkspaceRelativePath(thread.cwd, candidatePath);
  }

  function openWorkspaceBrowser(requestedPath: string | null = null, requestedLine: number | null = null) {
    setWorkspaceBrowserState((current) => ({
      open: true,
      requestedPath,
      requestedLine,
      requestKey: current.requestKey + 1
    }));
  }

  const handleFilePathClick = useCallback((href: string) => {
    const { path, line } = parseFilePathWithLine(href);
    const workspacePath = toWorkspaceRelativePath(thread.cwd, path);
    if (workspacePath) {
      setWorkspaceBrowserState((current) => ({
        open: true,
        requestedPath: workspacePath,
        requestedLine: line,
        requestKey: current.requestKey + 1
      }));
    }
  }, [thread.cwd]);

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-none bg-card/68 py-0 gap-0">
      {/* Header */}
      <div className="shrink-0 border-b border-subtle/6 bg-background/35 px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            {!isDesktop ? (
              <Button onClick={onBack} size="icon-sm" variant="ghost">
                <ArrowLeft className="size-4" />
                <span className="sr-only">{t("detail.action.backToThreads")}</span>
              </Button>
            ) : null}
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-heading text-[1.1rem] tracking-[-0.04em] md:max-w-[34rem] md:text-[1.32rem] lg:max-w-[42rem] xl:max-w-[48rem]">
                  {buildThreadTitle(thread, t)}
                </h2>
                <div className="shrink-0">
                  <StatusBadge
                    label={formatStatusLabel(thread.status, t)}
                    tone={getStatusTone(thread.status)}
                  />
                </div>
              </div>
              <CwdPathDisplay cwd={thread.cwd} />
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 md:self-start">
            {!isDesktop ? (
              <MobileThreadSwitcher
                onOpenThread={onOpenThread}
                selectedThreadId={selectedThreadId}
                threadsState={threadsState}
              />
            ) : null}
            <Button
              onClick={() => {
                openWorkspaceBrowser();
              }}
              size="sm"
              variant="outline"
            >
              <FolderOpen className="size-3.5" />
              {t("detail.workspace.open")}
            </Button>
          </div>
        </div>

        {thread.pendingRequests.length > 0 ? (
          <div className="mt-3">
            <Badge className="bg-secondary/16 text-secondary pulse-secondary" variant="secondary">
              {t("detail.badge.pendingRequests", {
                count: thread.pendingRequests.length
              })}
            </Badge>
          </div>
        ) : null}
      </div>

      {/* Connection / error banners */}
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

      {/* Pending requests */}
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

      {/* Message stream */}
      <div
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-4 md:px-5"
        ref={scrollRef}
      >
        {flatItems.length === 0 ? (
          <EmptyDetailState
            message={t("detail.empty.noMessages.message")}
            title={t("detail.empty.noMessages.title")}
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 pb-4">
            {flatItems.map((item) => (
              <FlatItemRenderer
                item={item}
                key={`${item.turnId}-${item.id}`}
                onFilePathClick={handleFilePathClick}
                onOpenWorkspacePath={(path) => {
                  openWorkspaceBrowser(path);
                }}
                resolveWorkspacePath={resolveWorkspacePath}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-subtle/6 bg-background/82 px-4 py-3 backdrop-blur-xl md:px-5">
        <ThreadComposer
          actionsEnabled={actionsEnabled}
          activeTurnId={activeTurnId}
          interruptPending={interruptPending}
          isDesktop={isDesktop}
          onInterrupt={onInterrupt}
          onSendMessage={onSendMessage}
          sendMessagePending={sendMessagePending}
          thread={thread}
        />
      </div>

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
        threadId={thread.id}
      />
    </Card>
  );
}

type ComposerModelsState =
  | { kind: "loading"; models: AvailableModel[]; message: string | null }
  | { kind: "ready"; models: AvailableModel[]; message: string | null }
  | { kind: "error"; models: AvailableModel[]; message: string };

function ThreadComposer({
  actionsEnabled,
  activeTurnId,
  interruptPending,
  isDesktop,
  onInterrupt,
  onSendMessage,
  sendMessagePending,
  thread
}: {
  actionsEnabled: boolean;
  activeTurnId: string | null;
  interruptPending: boolean;
  isDesktop: boolean;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  onSendMessage: (
    threadId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides
  ) => Promise<boolean>;
  sendMessagePending: boolean;
  thread: ThreadDetail;
}) {
  const { t } = useI18n();
  const bridgeClient = useBridgeClient();
  const committedSettings = buildComposerSettingsDraft(thread.settings);
  const [composerText, setComposerText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<ThreadSettings>(() =>
    committedSettings
  );
  const [modelsState, setModelsState] = useState<ComposerModelsState>({
    kind: "loading",
    models: [],
    message: null
  });

  useEffect(() => {
    setSettingsDraft(committedSettings);
  }, [
    thread.id,
    thread.settings?.model,
    thread.settings?.reasoningEffort,
    thread.settings?.permissionsPreset
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setModelsState((current) => ({
        kind: "loading",
        models: current.models,
        message: null
      }));

      try {
        const response = await bridgeClient.listModels(true);
        if (cancelled) {
          return;
        }
        setModelsState({
          kind: "ready",
          models: response.data,
          message: null
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setModelsState({
          kind: "error",
          models: [],
          message: error instanceof Error ? error.message : t("common.unknownClientError")
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bridgeClient, t, thread.id]);

  const selectedModel = findModelDefinition(modelsState.models, settingsDraft.model);

  const modelSelectValue = modelsState.models.find(
    (m) => m.model === settingsDraft.model || m.id === settingsDraft.model
  )?.id ?? modelsState.models[0]?.id ?? "";

  const selectedReasoningOption = selectedModel?.supportedReasoningEfforts.find(
    (opt) => opt.reasoningEffort === settingsDraft.reasoningEffort
  );

  const selectedPermissionOption = getPermissionPresetOptions(t).find(
    (opt) => opt.id === settingsDraft.permissionsPreset
  );

  const canSend =
    actionsEnabled && !sendMessagePending && composerText.trim().length > 0;

  const selectedModelSummary = formatModelTriggerText(
    committedSettings,
    modelsState.models,
    t("common.notAvailable")
  );

  async function reloadModels() {
    setModelsState((current) => ({
      kind: "loading",
      models: current.models,
      message: null
    }));

    try {
      const response = await bridgeClient.listModels(true);
      setModelsState({
        kind: "ready",
        models: response.data,
        message: null
      });
    } catch (error) {
      setModelsState({
        kind: "error",
        models: [],
        message: error instanceof Error ? error.message : t("common.unknownClientError")
      });
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (thread.id.length === 0) {
          return;
        }

        const settingsOverrides = buildTurnSettingsOverrides(thread.settings, settingsDraft);
        void (async () => {
          const sent = await onSendMessage(thread.id, composerText, settingsOverrides);
          if (sent) {
            setComposerText("");
            setSettingsOpen(false);
          }
        })();
      }}
    >
      <div className="rounded-[1.35rem] border border-subtle/8 bg-card/84 px-3 py-2.5 shadow-sm">
        <Textarea
          autoFocus
          className="min-h-[52px] max-h-[32vh] resize-none border-0 bg-transparent px-1 py-0.5 font-mono text-sm leading-6 shadow-none transition-shadow duration-200 placeholder:text-muted-foreground/45 focus-visible:ring-0"
          id="thread-composer"
          onChange={(event) => {
            setComposerText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (!isDesktop) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={t("detail.composer.placeholder")}
          rows={2}
          value={composerText}
        />

        <div className="mt-2 flex items-center gap-1.5">
          <Sheet
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setSettingsDraft(committedSettings);
              }
              setSettingsOpen(nextOpen);
            }}
            open={settingsOpen}
          >
            <SheetTrigger asChild>
              <Button
                className="h-9 min-w-0 rounded-full border-subtle/10 bg-background/72 px-3 text-left text-sm font-medium"
                type="button"
                variant="outline"
              >
                <span className="min-w-0 flex-1 truncate">{selectedModelSummary}</span>
                <ChevronDown className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </SheetTrigger>

            <SheetContent
              className={cn(
                "gap-0 overflow-hidden border-subtle/10 bg-popover",
                !isDesktop && "max-h-[82vh] rounded-t-[1.5rem]"
              )}
              side={isDesktop ? "right" : "bottom"}
            >
              <SheetHeader className="border-b border-subtle/6 pb-3">
                <SheetTitle>{t("detail.composer.settings.title")}</SheetTitle>
                <SheetDescription>{t("detail.composer.settings.description")}</SheetDescription>
              </SheetHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                <ComposerSettingsSection
                  description={t("detail.composer.settings.modelDescription")}
                  title={t("detail.composer.settings.model")}
                >
                  {modelsState.kind === "loading" && modelsState.models.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("detail.composer.settings.modelsLoading")}
                    </p>
                  ) : null}

                  {modelsState.kind === "error" ? (
                    <div className="space-y-2 rounded-2xl border border-destructive/15 bg-destructive/5 p-3">
                      <p className="text-sm text-destructive">
                        {modelsState.message ?? t("detail.composer.settings.modelsLoadFailed")}
                      </p>
                      <Button onClick={() => void reloadModels()} size="sm" type="button" variant="outline">
                        {t("detail.composer.settings.retry")}
                      </Button>
                    </div>
                  ) : null}

                  {modelsState.models.length > 0 ? (
                    <div className="space-y-1.5">
                      <Select
                        value={modelSelectValue}
                        onValueChange={(id) => {
                          const model = modelsState.models.find((m) => m.id === id);
                          if (model) {
                            setSettingsDraft((current) => ({
                              ...current,
                              model: model.model,
                              reasoningEffort: normalizeReasoningEffortSelection(
                                model,
                                current.reasoningEffort
                              )
                            }));
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {modelsState.models.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedModel ? (
                        <p className="px-1 text-xs leading-relaxed text-muted-foreground/70">
                          {selectedModel.description}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </ComposerSettingsSection>

                <ComposerSettingsSection
                  description={t("detail.composer.settings.reasoningDescription")}
                  title={t("detail.composer.settings.reasoning")}
                >
                  {selectedModel && selectedModel.supportedReasoningEfforts.length > 0 ? (
                    <div className="space-y-1.5">
                      <Select
                        value={settingsDraft.reasoningEffort ?? selectedModel.defaultReasoningEffort}
                        onValueChange={(value) => {
                          setSettingsDraft((current) => ({
                            ...current,
                            reasoningEffort: value as ReasoningEffort
                          }));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedModel.supportedReasoningEfforts.map((option) => (
                            <SelectItem key={option.reasoningEffort} value={option.reasoningEffort}>
                              {formatReasoningEffortLabel(option.reasoningEffort, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedReasoningOption ? (
                        <p className="px-1 text-xs leading-relaxed text-muted-foreground/70">
                          {selectedReasoningOption.description}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("detail.composer.settings.reasoningUnavailable")}
                    </p>
                  )}
                </ComposerSettingsSection>

                <ComposerSettingsSection
                  description={t("detail.composer.settings.permissionsDescription")}
                  title={t("detail.composer.settings.permissions")}
                >
                  <div className="space-y-1.5">
                    <Select
                      value={settingsDraft.permissionsPreset ?? "auto"}
                      onValueChange={(value) => {
                        setSettingsDraft((current) => ({
                          ...current,
                          permissionsPreset: value as ThreadPermissionPresetId
                        }));
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getPermissionPresetOptions(t).map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPermissionOption ? (
                      <p className="px-1 text-xs leading-relaxed text-muted-foreground/70">
                        {selectedPermissionOption.description}
                      </p>
                    ) : null}
                  </div>
                </ComposerSettingsSection>
              </div>
            </SheetContent>
          </Sheet>

          <div className="ml-auto flex items-center gap-1">
            <ContextUsageButton usage={thread.contextUsage} />

            {activeTurnId ? (
              <Button
                className="size-7 rounded-full"
                disabled={!actionsEnabled || interruptPending}
                onClick={() => {
                  void onInterrupt(thread.id, activeTurnId);
                }}
                size="icon"
                type="button"
                variant="outline"
              >
                <Square className="size-3" />
                <span className="sr-only">{t("detail.action.stop")}</span>
              </Button>
            ) : (
              <Button
                className="size-7 rounded-full"
                disabled={!canSend}
                size="icon"
                type="submit"
              >
                <Send className="size-3" />
                <span className="sr-only">{t("detail.action.send")}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function ContextUsageButton({
  usage
}: {
  usage: ThreadDetail["contextUsage"];
}) {
  const { t } = useI18n();
  const percentUsed = getContextUsagePercent(usage);
  const usedTokens = usage?.total.totalTokens ?? null;
  const totalWindow = usage?.modelContextWindow ?? null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-80"
          type="button"
        >
          <ContextUsageRing percentUsed={percentUsed} />
          <span className="sr-only">{t("detail.composer.context.title")}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t("detail.composer.context.title")}</PopoverTitle>
          <PopoverDescription>{t("detail.composer.context.description")}</PopoverDescription>
        </PopoverHeader>

        {usage ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <ContextUsageStat
                label={t("detail.composer.context.percent")}
                value={
                  percentUsed !== null
                    ? `${Math.round(percentUsed)}%`
                    : t("detail.composer.context.unavailable")
                }
              />
              <ContextUsageStat
                label={t("detail.composer.context.used")}
                value={usedTokens !== null ? formatTokenCount(usedTokens) : t("detail.composer.context.unavailable")}
              />
              <ContextUsageStat
                label={t("detail.composer.context.window")}
                value={
                  totalWindow !== null
                    ? formatTokenCount(totalWindow)
                    : t("detail.composer.context.unavailable")
                }
              />
              <ContextUsageStat
                label={t("detail.composer.context.latestTurn")}
                value={formatTokenCount(usage.last.totalTokens)}
              />
            </div>

            <div className="rounded-2xl border border-subtle/8 bg-background/60 p-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <span>{t("detail.composer.context.breakdown")}</span>
                <span>{formatTokenCount(usage.last.totalTokens)}</span>
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>{t("detail.composer.context.input")}</span>
                  <span>{formatTokenCount(usage.last.inputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("detail.composer.context.cached")}</span>
                  <span>{formatTokenCount(usage.last.cachedInputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("detail.composer.context.output")}</span>
                  <span>{formatTokenCount(usage.last.outputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("detail.composer.context.reasoning")}</span>
                  <span>{formatTokenCount(usage.last.reasoningOutputTokens)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("detail.composer.context.unavailableDescription")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ComposerSettingsSection({
  children,
  description,
  title
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ContextUsageStat({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-subtle/8 bg-background/60 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-medium text-foreground">{value}</div>
    </div>
  );
}

function ContextUsageRing({
  percentUsed
}: {
  percentUsed: number | null;
}) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent =
    percentUsed === null ? null : Math.max(0, Math.min(percentUsed, 100));
  const progress = clampedPercent === null ? 0 : clampedPercent / 100;
  const dashOffset = circumference * (1 - progress);

  // Use theme tokens so colors adapt to dark / light mode automatically
  const trackColor = "var(--color-border)";
  const arcColor =
    clampedPercent === null
      ? "var(--color-muted-foreground)"
      : clampedPercent < 50
        ? "var(--color-primary)"
        : clampedPercent < 80
          ? "var(--color-chart-2)"
          : "var(--color-destructive)";

  return (
    <svg
      aria-hidden="true"
      className="size-8"
      viewBox="0 0 36 36"
    >
      {/* Background track — represents the full context window */}
      <circle
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        stroke={trackColor}
        strokeOpacity={0.55}
        strokeWidth="3"
      />
      {/* Progress arc — represents the used portion */}
      {clampedPercent !== null && clampedPercent > 0 ? (
        <circle
          cx="18"
          cy="18"
          fill="none"
          r={radius}
          stroke={arcColor}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth="3"
          transform="rotate(-90 18 18)"
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
        />
      ) : null}
      <text
        dominantBaseline="central"
        fill={arcColor}
        fillOpacity={clampedPercent === null ? 0.6 : 0.7}
        fontSize="13.5"
        fontWeight="600"
        textAnchor="middle"
        x="18"
        y="18"
      >
        C
      </text>
    </svg>
  );
}

function buildComposerSettingsDraft(settings: ThreadSettings | null): ThreadSettings {
  return (
    settings ?? {
      model: null,
      reasoningEffort: null,
      permissionsPreset: null
    }
  );
}

function buildTurnSettingsOverrides(
  current: ThreadSettings | null,
  draft: ThreadSettings
): ThreadTurnSettingsOverrides | undefined {
  const next: ThreadTurnSettingsOverrides = {};
  const currentModel = current?.model ?? null;
  const currentReasoningEffort = current?.reasoningEffort ?? null;
  const currentPermissionsPreset = current?.permissionsPreset ?? null;

  if (draft.model !== currentModel) {
    next.model = draft.model;
  }
  if (draft.reasoningEffort !== currentReasoningEffort) {
    next.reasoningEffort = draft.reasoningEffort;
  }
  if (draft.permissionsPreset !== currentPermissionsPreset) {
    next.permissionsPreset = draft.permissionsPreset;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function findModelDefinition(
  models: AvailableModel[],
  modelId: string | null
): AvailableModel | null {
  if (!modelId) {
    return null;
  }

  return models.find((model) => model.model === modelId || model.id === modelId) ?? null;
}

function normalizeReasoningEffortSelection(
  model: AvailableModel,
  current: ReasoningEffort | null
): ReasoningEffort | null {
  if (model.supportedReasoningEfforts.length === 0) {
    return current;
  }

  if (
    current &&
    model.supportedReasoningEfforts.some(
      (option) => option.reasoningEffort === current
    )
  ) {
    return current;
  }

  return model.defaultReasoningEffort;
}

function formatModelTriggerText(
  settings: ThreadSettings,
  models: AvailableModel[],
  fallback: string
): string {
  const modelName = settings.model ?? fallback;
  const model = findModelDefinition(models, settings.model);
  const canonicalModelName = model?.model ?? modelName;
  if (settings.reasoningEffort) {
    return `${canonicalModelName} ${settings.reasoningEffort}`;
  }
  return canonicalModelName;
}

function formatReasoningEffortLabel(
  effort: ReasoningEffort,
  t: (key: string) => string
): string {
  switch (effort) {
    case "none":
      return t("detail.composer.settings.reasoning.none");
    case "minimal":
      return t("detail.composer.settings.reasoning.minimal");
    case "low":
      return t("detail.composer.settings.reasoning.low");
    case "medium":
      return t("detail.composer.settings.reasoning.medium");
    case "high":
      return t("detail.composer.settings.reasoning.high");
    case "xhigh":
      return t("detail.composer.settings.reasoning.xhigh");
  }
}

function getPermissionPresetOptions(t: (key: string) => string): Array<{
  id: ThreadPermissionPresetId;
  label: string;
  description: string;
}> {
  return [
    {
      id: "read-only",
      label: t("detail.composer.settings.permissions.readOnly"),
      description: t("detail.composer.settings.permissions.readOnlyDescription")
    },
    {
      id: "auto",
      label: t("detail.composer.settings.permissions.default"),
      description: t("detail.composer.settings.permissions.defaultDescription")
    },
    {
      id: "full-access",
      label: t("detail.composer.settings.permissions.fullAccess"),
      description: t("detail.composer.settings.permissions.fullAccessDescription")
    }
  ];
}

function getContextUsagePercent(
  usage: ThreadDetail["contextUsage"]
): number | null {
  if (!usage || !usage.modelContextWindow || usage.modelContextWindow <= 0) {
    return null;
  }

  return (usage.total.totalTokens / usage.modelContextWindow) * 100;
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

// ---------------------------------------------------------------------------
// Flat item renderer
// ---------------------------------------------------------------------------

function FlatItemRenderer({
  item,
  onFilePathClick,
  onOpenWorkspacePath,
  resolveWorkspacePath
}: {
  item: FlatThreadItem;
  onFilePathClick?: ((href: string) => void) | undefined;
  onOpenWorkspacePath: (path: string) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
}) {
  const { t } = useI18n();

  switch (item.type) {
    case "userMessage":
      return (
        <UserMessageBubble>
          {item.content.map((input, index) => (
            <UserInputRenderer input={input} key={`${item.id}-${index}`} onFilePathClick={onFilePathClick} />
          ))}
        </UserMessageBubble>
      );
    case "agentMessage":
      return (
        <AgentMessageBlock>
          {item.text ? (
            <RichMarkdown content={item.text} onFilePathClick={onFilePathClick} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {t("detail.agent.noTextReturned")}
            </p>
          )}
        </AgentMessageBlock>
      );
    case "reasoning":
      if (item.summary.length === 0 && item.content.length === 0) {
        return null;
      }
      return <ThinkingBlock item={item} />;
    case "commandExecution":
      return <CommandCard item={item} />;
    case "fileChange":
      return (
        <FileChangeCard
          item={item}
          onOpenWorkspacePath={onOpenWorkspacePath}
          resolveWorkspacePath={resolveWorkspacePath}
        />
      );
    case "webSearch":
      return (
        <ToolLabel
          icon={<Search className="size-3" />}
          label={t("detail.tool.webSearch")}
          value={item.query}
        />
      );
    case "imageView":
      return (
        <ToolLabel
          icon={<GalleryHorizontal className="size-3" />}
          label={t("detail.tool.image")}
          value={item.path}
        />
      );
    case "unknown":
      return (
        <div className="lg:ml-9">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button size="xs" variant="ghost">
                <ExternalLink className="mr-1 size-3" />
                {item.title}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <RichCodeBlock className="bg-code-bg" language="json">
                {JSON.stringify(item.raw, null, 2)}
              </RichCodeBlock>
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Message components
// ---------------------------------------------------------------------------

function UserMessageBubble({ children }: { children: import("react").ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-subtle/[0.06] px-4 py-3">
        <div className="space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

function AgentMessageBlock({ children }: { children: import("react").ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="hidden lg:flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/12">
        <img src="/openai.svg" alt="" className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}

function ThinkingBlock({ item }: { item: Extract<ThreadItem, { type: "reasoning" }> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:ml-9">
      <button
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[0.8rem] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Brain className="size-3.5" />
        <span>{t("detail.reasoning.thinking")}</span>
        <ChevronDown className={cn("size-3 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-subtle/8 bg-secondary/6 p-3">
          {item.summary.length > 0 ? (
            <ul className="space-y-1.5 text-sm leading-6 text-foreground">
              {item.summary.map((summary, index) => (
                <li key={index}>{summary}</li>
              ))}
            </ul>
          ) : null}
          {item.content.length > 0 ? (
            <div className="space-y-2">
              {item.content.map((content, index) => (
                <div key={index} className="rounded-lg bg-background/50 px-3 py-2">
                  {looksLikeMarkdownContent(content) ? (
                    <RichMarkdown className="text-sm text-muted-foreground" content={content} />
                  ) : (
                    <ReasoningPreformatted content={content} />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CommandCard({ item }: { item: Extract<ThreadItem, { type: "commandExecution" }> }) {
  const { t } = useI18n();
  const displayCommand = getCommandDisplay(item.command);
  const commandExpanded = displayCommand !== item.command;
  const hasDetails = commandExpanded || item.aggregatedOutput;

  return (
    <Collapsible className="lg:ml-9 overflow-hidden rounded-xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]">
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-subtle/[0.03]"
          type="button"
        >
          <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {displayCommand}
          </span>
          {item.durationMs ? (
            <CommandMetaBadge label={`${Math.round(item.durationMs / 1000)}s`} />
          ) : null}
          {item.status === "inProgress" || item.status === "failed" ? (
            <StatusBadge
              label={formatExecutionStatus(item.status, t)}
              tone={item.status === "failed" ? "error" : "active"}
            />
          ) : null}
          {hasDetails ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
          ) : null}
        </button>
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent>
          <div className="space-y-0">
            {commandExpanded ? (
              <div className="border-t border-subtle/4 px-3 py-2">
                <p className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-foreground/80">
                  {item.command}
                </p>
              </div>
            ) : null}
            {item.aggregatedOutput ? (
              <div className="border-t border-subtle/4 p-3">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button size="xs" variant="ghost" className="text-muted-foreground">
                      <ChevronDown className="mr-0.5 size-3 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                      {t("detail.command.output")}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pt-2">
                      <RichTerminalOutput
                        className="rounded-lg border border-subtle/8 bg-code-bg"
                        content={item.aggregatedOutput}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function FileChangeCard({
  item,
  onOpenWorkspacePath,
  resolveWorkspacePath
}: {
  item: Extract<ThreadItem, { type: "fileChange" }>;
  onOpenWorkspacePath: (path: string) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="lg:ml-9 space-y-1.5">
      {item.changes.map((change, index) => (
        <div
          className="overflow-hidden rounded-xl border border-subtle/8 shadow-[inset_0_0_0_1px_var(--color-subtle)/5]"
          key={`${item.id}-${index}`}
        >
          <div className="flex items-center gap-2 bg-background/85 px-3 py-2">
            <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
              {change.path}
            </p>
            {change.kind ? (
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                {change.kind}
              </span>
            ) : null}
            {resolveWorkspacePath(change.path) ? (
              <Button
                onClick={() => {
                  const workspacePath = resolveWorkspacePath(change.path);
                  if (!workspacePath) {
                    return;
                  }
                  onOpenWorkspacePath(workspacePath);
                }}
                size="xs"
                type="button"
                variant="ghost"
              >
                {t("detail.workspace.action.openFile")}
              </Button>
            ) : null}
          </div>
          {change.diff ? (
            <Collapsible>
              <div className="border-t border-subtle/4 px-3 py-1">
                <CollapsibleTrigger asChild>
                  <Button size="xs" variant="ghost" className="text-muted-foreground">
                    {t("detail.fileChange.showDiff")}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="border-t border-subtle/4 p-3">
                  <RichCodeBlock className="bg-code-bg" language="diff">
                    {change.diff}
                  </RichCodeBlock>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ToolLabel({ icon, label, value }: { icon: import("react").ReactNode; label: string; value: string }) {
  return (
    <div className="lg:ml-9 flex items-center gap-1.5 rounded-lg bg-accent/60 px-2.5 py-1.5 text-muted-foreground">
      {icon}
      <span className="font-mono text-[0.7rem] uppercase tracking-wide">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile thread switcher
// ---------------------------------------------------------------------------

function MobileThreadSwitcher({
  onOpenThread,
  selectedThreadId,
  threadsState
}: {
  onOpenThread: (threadId: string) => void;
  selectedThreadId: string | null;
  threadsState: ThreadListState;
}) {
  const { t } = useI18n();

  if (threadsState.kind !== "ready") {
    return null;
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon-sm" variant="outline">
          <PanelLeftOpen className="size-4" />
          <span className="sr-only">{t("detail.switcher.open")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="max-w-sm border-l border-subtle/6 bg-card/95" side="right">
        <SheetHeader>
          <SheetTitle>{t("detail.switcher.title")}</SheetTitle>
          <SheetDescription>
            {t("detail.switcher.description")}
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[calc(100svh-7rem)] space-y-2 overflow-y-auto px-4 pb-4">
          {threadsState.threads.map((thread) => (
            <Button
              className={cn(
                "h-auto w-full justify-start rounded-[12px] border border-subtle/8 bg-card/76 px-4 py-3 text-left",
                selectedThreadId === thread.id &&
                  "border-primary/20 bg-card shadow-[inset_0_0_0_1px_rgba(78,222,163,0.14)]"
              )}
              key={thread.id}
              onClick={() => {
                onOpenThread(thread.id);
              }}
              variant="ghost"
            >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {buildThreadTitle(thread, t)}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {thread.cwd}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function EmptyDetailState({
  message,
  title
}: {
  message: string;
  title: string;
}) {
  return (
    <Card className="h-full rounded-none bg-card/68">
      <CardContent className="grid h-full place-items-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Sparkles className="size-6" />
          </div>
          <h2 className="font-heading text-2xl tracking-[-0.04em]">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  label,
  tone
}: {
  label: string;
  tone: "active" | "error" | "neutral" | "waitingApproval" | "waitingInput";
}) {
  const classes =
    tone === "waitingApproval"
      ? "bg-secondary/16 text-secondary pulse-secondary"
      : tone === "waitingInput"
        ? "bg-primary/12 text-primary"
        : tone === "active"
          ? "bg-primary/12 text-primary"
          : tone === "error"
            ? "bg-destructive/12 text-destructive"
            : "bg-background/70 text-muted-foreground";

  return (
    <Badge className={cn("border-0 font-mono text-[0.7rem] uppercase", classes)} variant="secondary">
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BANNER_DELAY_MS = 1500;

function useDeferredBanner(
  connectionState: LocalConnectionState,
  t: (key: string) => string
) {
  const [visibleBanner, setVisibleBanner] = useState<ReturnType<typeof connectionBanner>>(null);

  useEffect(() => {
    const next = connectionBanner(connectionState, t);
    if (!next) {
      setVisibleBanner(null);
      return;
    }
    const timer = setTimeout(() => {
      setVisibleBanner(connectionBanner(connectionState, t));
    }, BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [connectionState.kind, connectionState.message, t]);

  return visibleBanner;
}

function connectionBanner(
  connectionState: LocalConnectionState,
  t: (key: string) => string
):
  | {
      message: string;
      title: string;
      tone: "info" | "error";
    }
  | null {
  switch (connectionState.kind) {
    case "authenticated":
      return null;
    case "refreshing":
      return {
        title: t("detail.banner.refreshing.title"),
        message: t("detail.banner.refreshing.message"),
        tone: "info"
      };
    case "reconnecting":
      return {
        title: t("detail.banner.reconnecting.title"),
        message: connectionState.message ?? t("detail.banner.reconnecting.message"),
        tone: "info"
      };
    case "resyncing":
      return {
        title: t("detail.banner.resyncing.title"),
        message: t("detail.banner.resyncing.message"),
        tone: "info"
      };
    case "disconnected":
      return {
        title: t("detail.banner.disconnected.title"),
        message: connectionState.message ?? t("detail.banner.disconnected.message"),
        tone: "error"
      };
    case "revoked":
      return {
        title: t("detail.banner.revoked.title"),
        message: connectionState.message ?? t("detail.banner.revoked.message"),
        tone: "error"
      };
    case "expired":
      return {
        title: t("detail.banner.expired.title"),
        message: connectionState.message ?? t("detail.banner.expired.message"),
        tone: "error"
      };
    case "unpaired":
      return {
        title: t("detail.banner.unpaired.title"),
        message: t("detail.banner.unpaired.message"),
        tone: "error"
      };
  }
}

function UserInputRenderer({
  input,
  onFilePathClick
}: {
  input: Extract<ThreadItem, { type: "userMessage" }>["content"][number];
  onFilePathClick?: ((href: string) => void) | undefined;
}) {
  const { t } = useI18n();

  switch (input.type) {
    case "text":
      return <RichMarkdown content={input.text} onFilePathClick={onFilePathClick} />;
    case "image":
      return <StructuredUserInput label={t("detail.userInput.image")} value={input.url} />;
    case "localImage":
      return <StructuredUserInput label={t("detail.userInput.localImage")} value={input.path} />;
    case "skill":
      return <StructuredUserInput label={t("detail.userInput.skill")} value={`${input.name} (${input.path})`} />;
    case "mention":
      return <StructuredUserInput label={t("detail.userInput.mention")} value={`${input.name} (${input.path})`} />;
  }
}

function formatExecutionStatus(
  status: "completed" | "failed" | "inProgress",
  t: (key: string) => string
) {
  switch (status) {
    case "completed":
      return t("turn.status.completed");
    case "failed":
      return t("turn.status.failed");
    case "inProgress":
      return t("turn.status.inProgress");
  }
}

function RichMarkdown({
  className,
  content,
  onFilePathClick
}: {
  className?: string | undefined;
  content: string;
  onFilePathClick?: ((href: string) => void) | undefined;
}) {
  return (
    <Suspense fallback={<PlainTextFallback className={className} content={content} />}>
      <LazyMarkdownContent {...(className ? { className } : {})} content={content} onFilePathClick={onFilePathClick} />
    </Suspense>
  );
}

function RichCodeBlock({
  children,
  chrome = true,
  className,
  language,
  shellPrompt = false
}: {
  children: string;
  chrome?: boolean;
  className?: string | undefined;
  language?: string | undefined;
  shellPrompt?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <PlainCodeFallback className={className} content={children} shellPrompt={shellPrompt} />
      }
    >
      <LazyCodeBlock
        chrome={chrome}
        {...(className ? { className } : {})}
        {...(language ? { language } : {})}
        shellPrompt={shellPrompt}
      >
        {children}
      </LazyCodeBlock>
    </Suspense>
  );
}

function RichTerminalOutput({
  className,
  content
}: {
  className?: string | undefined;
  content: string;
}) {
  return (
    <Suspense fallback={<PlainCodeFallback className={className} content={content} />}>
      <LazyTerminalOutput {...(className ? { className } : {})} content={content} />
    </Suspense>
  );
}

function CommandMetaBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-subtle/8 bg-background/45 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </span>
  );
}

function PlainTextFallback({
  className,
  content
}: {
  className?: string | undefined;
  content: string;
}) {
  return (
    <div className={cn("whitespace-pre-wrap break-words text-sm leading-6 text-foreground", className)}>
      {content}
    </div>
  );
}

function PlainCodeFallback({
  className,
  content,
  shellPrompt = false
}: {
  className?: string | undefined;
  content: string;
  shellPrompt?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]",
        className
      )}
    >
      <pre
        className={cn(
          "m-0 overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-[0.8rem] leading-[1.65] text-foreground",
          shellPrompt && "pl-8"
        )}
      >
        {shellPrompt ? `$ ${content}` : content}
      </pre>
    </div>
  );
}

function ReasoningPreformatted({ content }: { content: string }) {
  return (
    <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-muted-foreground">
      {content}
    </pre>
  );
}

function StructuredUserInput({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-subtle/8 bg-background/45 px-3 py-2.5">
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function CopyPathButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="shrink-0 rounded-md p-1 text-popover-foreground/50 transition-colors hover:bg-subtle/10 hover:text-popover-foreground"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      type="button"
    >
      {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
    </button>
  );
}

function CwdPathDisplay({ cwd }: { cwd: string }) {
  const displayName = cwd ? cwd.split(/[\\/]/).filter(Boolean).pop() || cwd : cwd;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Show full working directory path"
          className="truncate font-mono text-xs text-muted-foreground transition-colors hover:text-foreground md:text-sm"
          type="button"
        >
          {displayName}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-sm flex-row items-center gap-2 p-2.5">
        <p className="min-w-0 break-all font-mono text-[0.7rem] leading-relaxed">
          {cwd}
        </p>
        <CopyPathButton value={cwd} />
      </PopoverContent>
    </Popover>
  );
}

function looksLikeMarkdownContent(content: string) {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return false;
  }

  return (
    /^#{1,6}\s/m.test(trimmed) ||
    /^>\s/m.test(trimmed) ||
    /^```/m.test(trimmed) ||
    /^\s*[-*+]\s/m.test(trimmed) ||
    /^\s*\d+\.\s/m.test(trimmed) ||
    /\[[^\]]+\]\([^)]+\)/.test(trimmed) ||
    /\|.+\|/.test(trimmed)
  );
}

function parseFilePathWithLine(href: string): { path: string; line: number | null } {
  const match = href.match(/^(.+?)#L(\d+)$/i);
  if (match?.[1] != null && match[2] != null) {
    return { path: match[1], line: parseInt(match[2], 10) };
  }
  return { path: href, line: null };
}

function getCommandDisplay(command: string): string {
  const trimmed = command.trim();
  const wrappedCommandMatch =
    /^(?<shell>(?:\/bin\/|\/usr\/bin\/)?(?:bash|zsh|sh))\s+(?<flags>-[A-Za-z]+(?:\s+-[A-Za-z]+)*)\s+(?<body>[\s\S]+)$/u.exec(
      trimmed
    );

  if (!wrappedCommandMatch?.groups) {
    return command;
  }

  const { body, flags } = wrappedCommandMatch.groups;
  if (!body || !flags || !flags.includes("c")) {
    return command;
  }

  const unwrappedBody = unwrapShellCommandBody(body);
  if (!unwrappedBody || unwrappedBody === trimmed) {
    return command;
  }

  return unwrappedBody;
}


function unwrapShellCommandBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length < 2) {
    return null;
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/'\\''/g, "'");
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  return trimmed;
}
