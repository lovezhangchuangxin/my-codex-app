import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Send,
  Square
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatTokenCount } from "@/features/threads/components/thread-detail-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useBridgeClient } from "@/lib/runtime/runtime-provider";
import { cn } from "@/lib/utils";
import type {
  AvailableModel,
  ReasoningEffort,
  ThreadDetail,
  ThreadPermissionPresetId,
  ThreadSettings,
  ThreadTurnSettingsOverrides
} from "@my-codex-app/protocol";

type ComposerModelsState =
  | { kind: "loading"; models: AvailableModel[]; message: string | null }
  | { kind: "ready"; models: AvailableModel[]; message: string | null }
  | { kind: "error"; models: AvailableModel[]; message: string };

export function ThreadComposer({
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
  const settingsKey = [
    thread.id,
    thread.settings?.model ?? "",
    thread.settings?.reasoningEffort ?? "",
    thread.settings?.permissionsPreset ?? ""
  ].join(":");
  const [composerText, setComposerText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraftState, setSettingsDraftState] = useState<{
    sourceKey: string;
    value: ThreadSettings;
  }>(() => ({
    sourceKey: settingsKey,
    value: committedSettings
  }));
  const [modelsState, setModelsState] = useState<ComposerModelsState>({
    kind: "loading",
    models: [],
    message: null
  });
  const settingsDraft =
    settingsDraftState.sourceKey === settingsKey ? settingsDraftState.value : committedSettings;

  function resetSettingsDraft() {
    setSettingsDraftState({
      sourceKey: settingsKey,
      value: committedSettings
    });
  }

  function updateSettingsDraft(next: ThreadSettings | ((current: ThreadSettings) => ThreadSettings)) {
    setSettingsDraftState((current) => {
      const base = current.sourceKey === settingsKey ? current.value : committedSettings;
      const value = typeof next === "function" ? next(base) : next;
      return {
        sourceKey: settingsKey,
        value
      };
    });
  }

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
  const modelSelectValue =
    modelsState.models.find(
      (model) => model.model === settingsDraft.model || model.id === settingsDraft.model
    )?.id ??
    modelsState.models[0]?.id ??
    "";
  const selectedReasoningOption = selectedModel?.supportedReasoningEfforts.find(
    (option) => option.reasoningEffort === settingsDraft.reasoningEffort
  );
  const selectedPermissionOption = getPermissionPresetOptions(t).find(
    (option) => option.id === settingsDraft.permissionsPreset
  );
  const canSend = actionsEnabled && !sendMessagePending && composerText.trim().length > 0;
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
                resetSettingsDraft();
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
                !isDesktop ? "max-h-[82vh] rounded-t-[1.5rem]" : ""
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
                        onValueChange={(id) => {
                          const model = modelsState.models.find((entry) => entry.id === id);
                          if (model) {
                            updateSettingsDraft((current) => ({
                              ...current,
                              model: model.model,
                              reasoningEffort: normalizeReasoningEffortSelection(
                                model,
                                current.reasoningEffort
                              )
                            }));
                          }
                        }}
                        value={modelSelectValue}
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
                        onValueChange={(value) => {
                          updateSettingsDraft((current) => ({
                            ...current,
                            reasoningEffort: value as ReasoningEffort
                          }));
                        }}
                        value={settingsDraft.reasoningEffort ?? selectedModel.defaultReasoningEffort}
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
                      onValueChange={(value) => {
                        updateSettingsDraft((current) => ({
                          ...current,
                          permissionsPreset: value as ThreadPermissionPresetId
                        }));
                      }}
                      value={settingsDraft.permissionsPreset ?? "auto"}
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
              <Button className="size-7 rounded-full" disabled={!canSend} size="icon" type="submit">
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
    <svg aria-hidden="true" className="size-8" viewBox="0 0 36 36">
      <circle
        cx="18"
        cy="18"
        fill="none"
        r={radius}
        stroke={trackColor}
        strokeOpacity={0.55}
        strokeWidth="3"
      />
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
    model.supportedReasoningEfforts.some((option) => option.reasoningEffort === current)
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

function getContextUsagePercent(usage: ThreadDetail["contextUsage"]): number | null {
  if (!usage || !usage.modelContextWindow || usage.modelContextWindow <= 0) {
    return null;
  }

  return (usage.total.totalTokens / usage.modelContextWindow) * 100;
}
