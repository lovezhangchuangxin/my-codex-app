import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Send, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  findSupportedComposerCommand,
  matchSupportedComposerCommands,
  type SupportedComposerCommand,
} from '@/features/threads/lib/composer-command-utils';
import {
  findMentionToken,
  findSlashCommandToken,
  formatPathInsertion,
  parseSlashCommandSubmission,
  replaceComposerToken,
} from '@/features/threads/lib/composer-input-utils';
import { formatTokenCount } from '@/features/threads/components/thread-detail-utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useBridgeClient } from '@/lib/runtime/runtime-context';
import { cn } from '@/lib/utils';
import {
  readNativeKeyboardInsetHeight,
  tauriKeyboardInsetChangeEvent,
} from '@/platform/viewport';
import type {
  AvailableModel,
  ReasoningEffort,
  ThreadDetail,
  ThreadPermissionPresetId,
  ThreadReviewRequest,
  ThreadSettings,
  ThreadTurnSettingsOverrides,
} from '@my-codex-app/protocol';
import type { WorkspaceSearchMatch } from '@my-codex-app/protocol';

type ComposerModelsState =
  | { kind: 'loading'; models: AvailableModel[]; message: string | null }
  | { kind: 'ready'; models: AvailableModel[]; message: string | null }
  | { kind: 'error'; models: AvailableModel[]; message: string };

export function ThreadComposer({
  actionsEnabled,
  activeTurnId,
  compactPending,
  interruptPending,
  isDesktop,
  onCompactThread,
  onCreateThread,
  onInterrupt,
  onOpenThreadSwitcher,
  onRenameThread,
  onSendMessage,
  onStartReview,
  sendMessagePending,
  thread,
}: {
  actionsEnabled: boolean;
  activeTurnId: string | null;
  compactPending: boolean;
  interruptPending: boolean;
  isDesktop: boolean;
  onCompactThread: (threadId: string) => Promise<boolean>;
  onCreateThread: (projectPath: string) => Promise<boolean>;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  onOpenThreadSwitcher: () => void;
  onRenameThread: (threadId: string, name: string) => Promise<boolean>;
  onSendMessage: (
    threadId: string,
    text: string,
    settings?: ThreadTurnSettingsOverrides,
  ) => Promise<boolean>;
  onStartReview: (request: ThreadReviewRequest) => Promise<boolean>;
  sendMessagePending: boolean;
  thread: ThreadDetail;
}) {
  const { t } = useI18n();
  const bridgeClient = useBridgeClient();
  const committedSettings = buildComposerSettingsDraft(thread.settings);
  const settingsKey = [
    thread.id,
    thread.settings?.model ?? '',
    thread.settings?.reasoningEffort ?? '',
    thread.settings?.permissionsPreset ?? '',
  ].join(':');
  const [composerText, setComposerText] = useState('');
  const [caretPosition, setCaretPosition] = useState(0);
  const [commandActionPending, setCommandActionPending] = useState(false);
  const [popupLayoutKey, setPopupLayoutKey] = useState(0);
  const [composerLift, setComposerLift] = useState(0);
  const [dismissedSlashToken, setDismissedSlashToken] = useState<string | null>(
    null,
  );
  const [dismissedMentionToken, setDismissedMentionToken] = useState<
    string | null
  >(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [fileSearchState, setFileSearchState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error';
    query: string;
    matches: WorkspaceSearchMatch[];
    message?: string;
  }>({
    status: 'idle',
    query: '',
    matches: [],
  });
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [reviewSheetMode, setReviewSheetMode] = useState<'menu' | 'custom'>(
    'menu',
  );
  const [reviewInstructions, setReviewInstructions] = useState('');
  const [renameSheetOpen, setRenameSheetOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(thread.name ?? '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraftState, setSettingsDraftState] = useState<{
    sourceKey: string;
    value: ThreadSettings;
  }>(() => ({
    sourceKey: settingsKey,
    value: committedSettings,
  }));
  const [modelsState, setModelsState] = useState<ComposerModelsState>({
    kind: 'loading',
    models: [],
    message: null,
  });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const fileSearchRequestIdRef = useRef(0);
  const focusRafRef = useRef(0);
  const settingsDraft =
    settingsDraftState.sourceKey === settingsKey
      ? settingsDraftState.value
      : committedSettings;
  const rawSlashToken = findSlashCommandToken(composerText, caretPosition);
  const rawMentionToken = findMentionToken(composerText, caretPosition);
  const mentionToken =
    rawMentionToken && rawMentionToken.token !== dismissedMentionToken
      ? rawMentionToken
      : null;
  const mentionTokenText = mentionToken?.token ?? null;
  const mentionQuery = mentionToken?.query ?? null;
  const hasSlashCommandContext =
    rawSlashToken !== null &&
    rawSlashToken.token !== dismissedSlashToken &&
    rawMentionToken === null;
  const slashCommandQuery = hasSlashCommandContext ? rawSlashToken.query : null;
  const matchedCommands =
    slashCommandQuery !== null
      ? matchSupportedComposerCommands(slashCommandQuery)
      : [];
  const slashToken = matchedCommands.length > 0 ? rawSlashToken : null;
  const commandPopupOpen = slashToken !== null && matchedCommands.length > 0;
  const filePopupOpen = mentionToken !== null;

  useEffect(() => {
    setRenameDraft(thread.name ?? '');
  }, [thread.id, thread.name]);

  function resetSettingsDraft() {
    setSettingsDraftState({
      sourceKey: settingsKey,
      value: committedSettings,
    });
  }

  function updateSettingsDraft(
    next: ThreadSettings | ((current: ThreadSettings) => ThreadSettings),
  ) {
    setSettingsDraftState((current) => {
      const base =
        current.sourceKey === settingsKey ? current.value : committedSettings;
      const value = typeof next === 'function' ? next(base) : next;
      return {
        sourceKey: settingsKey,
        value,
      };
    });
  }

  function focusComposer(nextCaret?: number) {
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      if (!isDesktop) {
        return;
      }
      textarea.focus();
      if (nextCaret !== undefined) {
        textarea.setSelectionRange(nextCaret, nextCaret);
        setCaretPosition(nextCaret);
      }
    });
  }

  function clearCommandDraft(nextText = '', nextCaret = 0) {
    setComposerText(nextText);
    setCaretPosition(nextCaret);
    setDismissedSlashToken(null);
    setDismissedMentionToken(null);
    setSelectedCommandIndex(0);
    setSelectedFileIndex(0);
    setFileSearchState({
      status: 'idle',
      query: '',
      matches: [],
    });
  }

  function openSettingsFromCommand() {
    const nextText = stripSlashCommandPrefix(composerText);
    clearCommandDraft(nextText, 0);
    setSettingsOpen(true);
  }

  function openRenameFromCommand() {
    clearCommandDraft();
    setRenameDraft(thread.name ?? '');
    setRenameSheetOpen(true);
  }

  function insertMentionPrefix() {
    setDismissedSlashToken(null);
    setDismissedMentionToken(null);
    setComposerText('@');
    focusComposer(1);
  }

  function autocompleteCommand(command: SupportedComposerCommand) {
    if (!slashToken) {
      return;
    }

    const { nextCaret, nextText } = replaceComposerToken(
      composerText,
      slashToken,
      `/${command.command}`,
    );
    setComposerText(nextText);
    setDismissedSlashToken(null);
    setSelectedCommandIndex(0);
    focusComposer(nextCaret);
  }

  function insertWorkspaceMatch(match: WorkspaceSearchMatch) {
    if (!mentionToken) {
      return;
    }

    const { nextCaret, nextText } = replaceComposerToken(
      composerText,
      mentionToken,
      formatPathInsertion(match.path),
    );
    setComposerText(nextText);
    setDismissedMentionToken(null);
    setSelectedFileIndex(0);
    focusComposer(nextCaret);
  }

  async function executeSupportedCommand(
    command: SupportedComposerCommand,
    args: string,
  ) {
    if (commandActionPending) {
      return;
    }

    switch (command.id) {
      case 'compact': {
        if (!actionsEnabled) {
          return;
        }
        setCommandActionPending(true);
        try {
          const completed = await onCompactThread(thread.id);
          if (completed) {
            clearCommandDraft();
            focusComposer(0);
          }
        } finally {
          setCommandActionPending(false);
        }
        return;
      }
      case 'review': {
        if (!actionsEnabled) {
          return;
        }
        if (args.trim().length === 0) {
          clearCommandDraft();
          setReviewSheetMode('menu');
          setReviewInstructions('');
          setReviewSheetOpen(true);
          return;
        }
        setCommandActionPending(true);
        try {
          const completed = await onStartReview({
            threadId: thread.id,
            target: {
              type: 'custom',
              instructions: args.trim(),
            },
          });
          if (completed) {
            clearCommandDraft();
            focusComposer(0);
          }
        } finally {
          setCommandActionPending(false);
        }
        return;
      }
      case 'rename': {
        if (!actionsEnabled) {
          return;
        }
        if (args.trim().length === 0) {
          openRenameFromCommand();
          return;
        }
        setCommandActionPending(true);
        try {
          const completed = await onRenameThread(thread.id, args.trim());
          if (completed) {
            clearCommandDraft();
            focusComposer(0);
          }
        } finally {
          setCommandActionPending(false);
        }
        return;
      }
      case 'new':
      case 'clear': {
        if (!actionsEnabled) {
          return;
        }
        setCommandActionPending(true);
        try {
          const completed = await onCreateThread(thread.cwd);
          if (completed) {
            clearCommandDraft();
            focusComposer(0);
          }
        } finally {
          setCommandActionPending(false);
        }
        return;
      }
      case 'resume':
        clearCommandDraft();
        onOpenThreadSwitcher();
        return;
      case 'mention':
        insertMentionPrefix();
        return;
      case 'model':
      case 'permissions':
        openSettingsFromCommand();
        return;
    }
  }

  async function submitSlashReview(target: ThreadReviewRequest['target']) {
    if (commandActionPending || !actionsEnabled) {
      return;
    }

    setCommandActionPending(true);
    try {
      const completed = await onStartReview({
        threadId: thread.id,
        target,
      });
      if (completed) {
        setReviewSheetOpen(false);
        setReviewSheetMode('menu');
        setReviewInstructions('');
        focusComposer(0);
      }
    } finally {
      setCommandActionPending(false);
    }
  }

  async function submitRename() {
    const nextName = renameDraft.trim();
    if (!actionsEnabled || commandActionPending || nextName.length === 0) {
      return;
    }

    setCommandActionPending(true);
    try {
      const completed = await onRenameThread(thread.id, nextName);
      if (completed) {
        setRenameSheetOpen(false);
        setRenameDraft(nextName);
        focusComposer(0);
      }
    } finally {
      setCommandActionPending(false);
    }
  }

  useEffect(() => {
    if (!commandPopupOpen && !filePopupOpen) {
      return;
    }

    const refresh = () => setPopupLayoutKey((k) => k + 1);
    window.addEventListener(
      tauriKeyboardInsetChangeEvent,
      refresh as EventListener,
    );
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener(
        tauriKeyboardInsetChangeEvent,
        refresh as EventListener,
      );
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, [commandPopupOpen, filePopupOpen, composerLift]);

  useEffect(() => {
    if (isDesktop || typeof window === 'undefined') {
      return;
    }

    const refreshTimeoutIds = new Set<number>();

    const refreshComposerLift = () => {
      const form = formRef.current;
      if (!form) {
        setComposerLift(0);
        return;
      }

      const activeElement = document.activeElement;
      const target =
        activeElement instanceof HTMLElement && form.contains(activeElement)
          ? activeElement
          : textareaRef.current;

      if (!target) {
        setComposerLift(0);
        return;
      }

      const viewport = window.visualViewport;
      const nativeKeyboardInset = readNativeKeyboardInsetHeight();
      const viewportVisibleBottom = viewport
        ? viewport.offsetTop + viewport.height - 12
        : window.innerHeight - 12;
      const nativeVisibleBottom = window.innerHeight - nativeKeyboardInset - 12;
      const visibleBottom = Math.min(
        viewportVisibleBottom,
        nativeVisibleBottom,
      );
      const targetRect = target.getBoundingClientRect();
      const nextLift = Math.max(
        0,
        Math.ceil(targetRect.bottom - visibleBottom),
      );

      setComposerLift((current) =>
        Math.abs(current - nextLift) <= 1 ? current : nextLift,
      );
    };

    const scheduleRefresh = (delay = 0) => {
      const timeoutId = window.setTimeout(() => {
        refreshTimeoutIds.delete(timeoutId);
        refreshComposerLift();
      }, delay);
      refreshTimeoutIds.add(timeoutId);
    };

    const handleViewportChange = () => {
      scheduleRefresh();
    };

    const handleNativeKeyboardInsetChange = () => {
      scheduleRefresh();
      scheduleRefresh(80);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const form = formRef.current;
      if (!form || !(event.target instanceof HTMLElement)) {
        return;
      }
      if (!form.contains(event.target)) {
        return;
      }

      refreshComposerLift();
      scheduleRefresh(80);
      scheduleRefresh(180);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const form = formRef.current;
      if (!form) {
        return;
      }

      const nextFocused =
        event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
      if (nextFocused && form.contains(nextFocused)) {
        scheduleRefresh();
        return;
      }

      scheduleRefresh(80);
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener(
      tauriKeyboardInsetChangeEvent,
      handleNativeKeyboardInsetChange,
    );
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      refreshTimeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      refreshTimeoutIds.clear();
      window.visualViewport?.removeEventListener(
        'resize',
        handleViewportChange,
      );
      window.visualViewport?.removeEventListener(
        'scroll',
        handleViewportChange,
      );
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener(
        tauriKeyboardInsetChangeEvent,
        handleNativeKeyboardInsetChange,
      );
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isDesktop]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setModelsState((current) => ({
        kind: 'loading',
        models: current.models,
        message: null,
      }));

      try {
        const response = await bridgeClient.listModels(false);
        if (cancelled) {
          return;
        }
        setModelsState({
          kind: 'ready',
          models: response.data,
          message: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setModelsState({
          kind: 'error',
          models: [],
          message:
            error instanceof Error
              ? error.message
              : t('common.unknownClientError'),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bridgeClient, t, thread.id]);

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [slashToken?.token]);

  useEffect(() => {
    setSelectedFileIndex(0);
  }, [mentionTokenText]);

  useEffect(() => {
    if (!filePopupOpen) {
      setFileSearchState({
        status: 'idle',
        query: '',
        matches: [],
      });
      return;
    }

    if (!actionsEnabled || mentionQuery === null) {
      setFileSearchState({
        status: 'error',
        query: mentionQuery ?? '',
        matches: [],
        message: t('detail.composer.popup.filesUnavailable'),
      });
      return;
    }

    if (mentionQuery.length === 0) {
      setFileSearchState({
        status: 'ready',
        query: '',
        matches: [],
      });
      return;
    }

    const requestId = fileSearchRequestIdRef.current + 1;
    fileSearchRequestIdRef.current = requestId;
    const timer = window.setTimeout(() => {
      void (async () => {
        setFileSearchState((current) => ({
          status: 'loading',
          query: mentionQuery,
          matches: current.query === mentionQuery ? current.matches : [],
        }));

        try {
          const response = await bridgeClient.searchWorkspaceFiles({
            threadId: thread.id,
            query: mentionQuery,
          });
          if (fileSearchRequestIdRef.current !== requestId) {
            return;
          }
          setFileSearchState({
            status: 'ready',
            query: response.query,
            matches: response.matches,
          });
        } catch (error) {
          if (fileSearchRequestIdRef.current !== requestId) {
            return;
          }
          setFileSearchState({
            status: 'error',
            query: mentionQuery,
            matches: [],
            message:
              error instanceof Error
                ? error.message
                : t('common.unknownClientError'),
          });
        }
      })();
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [actionsEnabled, bridgeClient, filePopupOpen, mentionQuery, t, thread.id]);

  const selectedModel = findModelDefinition(
    modelsState.models,
    settingsDraft.model,
  );
  const modelSelectValue =
    modelsState.models.find(
      (model) =>
        model.model === settingsDraft.model || model.id === settingsDraft.model,
    )?.id ??
    modelsState.models[0]?.id ??
    '';
  const selectedReasoningOption = selectedModel?.supportedReasoningEfforts.find(
    (option) => option.reasoningEffort === settingsDraft.reasoningEffort,
  );
  const selectedPermissionOption = getPermissionPresetOptions(t).find(
    (option) => option.id === settingsDraft.permissionsPreset,
  );
  const canSend =
    actionsEnabled &&
    !sendMessagePending &&
    !commandActionPending &&
    !compactPending &&
    composerText.trim().length > 0;
  const selectedModelSummary = formatModelTriggerText(
    committedSettings,
    modelsState.models,
    t('common.notAvailable'),
  );
  const selectedCommand =
    matchedCommands[selectedCommandIndex] ?? matchedCommands[0] ?? null;
  const selectedFileMatch =
    fileSearchState.matches[selectedFileIndex] ??
    fileSearchState.matches[0] ??
    null;

  async function reloadModels() {
    setModelsState((current) => ({
      kind: 'loading',
      models: current.models,
      message: null,
    }));

    try {
      const response = await bridgeClient.listModels(false);
      setModelsState({
        kind: 'ready',
        models: response.data,
        message: null,
      });
    } catch (error) {
      setModelsState({
        kind: 'error',
        models: [],
        message:
          error instanceof Error
            ? error.message
            : t('common.unknownClientError'),
      });
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (filePopupOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedFileIndex((current) =>
          fileSearchState.matches.length === 0
            ? 0
            : (current + 1) % fileSearchState.matches.length,
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedFileIndex((current) =>
          fileSearchState.matches.length === 0
            ? 0
            : (current - 1 + fileSearchState.matches.length) %
              fileSearchState.matches.length,
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (selectedFileMatch) {
          event.preventDefault();
          insertWorkspaceMatch(selectedFileMatch);
          return;
        }
      }
      if (event.key === 'Escape' && mentionToken) {
        event.preventDefault();
        setDismissedMentionToken(mentionToken.token);
        return;
      }
    }

    if (commandPopupOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedCommandIndex((current) =>
          matchedCommands.length === 0
            ? 0
            : (current + 1) % matchedCommands.length,
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedCommandIndex((current) =>
          matchedCommands.length === 0
            ? 0
            : (current - 1 + matchedCommands.length) % matchedCommands.length,
        );
        return;
      }
      if (event.key === 'Tab' && selectedCommand) {
        event.preventDefault();
        autocompleteCommand(selectedCommand);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && selectedCommand) {
        event.preventDefault();
        void executeSupportedCommand(selectedCommand, '');
        return;
      }
      if (event.key === 'Escape' && slashToken) {
        event.preventDefault();
        setDismissedSlashToken(slashToken.token);
        return;
      }
    }

    if (!isDesktop) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form
      className="relative space-y-3"
      ref={formRef}
      style={{
        transform:
          !isDesktop && composerLift > 0
            ? `translateY(-${composerLift}px)`
            : undefined,
        transition: !isDesktop ? 'transform 180ms ease-out' : undefined,
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (thread.id.length === 0 || commandActionPending) {
          return;
        }

        const slashSubmission = parseSlashCommandSubmission(composerText);
        const supportedCommand = slashSubmission
          ? findSupportedComposerCommand(slashSubmission.commandName)
          : null;
        if (
          supportedCommand &&
          (supportedCommand.supportsInlineArgs ||
            slashSubmission?.args.length === 0)
        ) {
          void executeSupportedCommand(
            supportedCommand,
            slashSubmission?.args ?? '',
          );
          return;
        }

        const settingsOverrides = buildTurnSettingsOverrides(
          thread.settings,
          settingsDraft,
        );
        void (async () => {
          const sent = await onSendMessage(
            thread.id,
            composerText,
            settingsOverrides,
          );
          if (sent) {
            setComposerText('');
            setSettingsOpen(false);
          }
        })();
      }}
    >
      {(commandPopupOpen || filePopupOpen) &&
      formRef.current &&
      typeof document !== 'undefined'
        ? (() => {
            const formRect = formRef.current.getBoundingClientRect();
            return createPortal(
              <div
                key={popupLayoutKey}
                className="fixed inset-x-0 z-50 mx-auto max-w-[var(--composer-popup-width)] px-4"
                style={
                  {
                    '--composer-popup-width': `${formRef.current.offsetWidth}px`,
                    bottom: `${Math.max(0, window.innerHeight - formRect.top + 6)}px`,
                  } as CSSProperties
                }
              >
                {commandPopupOpen ? (
                  <ComposerCommandPopup
                    commands={matchedCommands}
                    onExecuteCommand={(command) => {
                      void executeSupportedCommand(command, '');
                    }}
                    selectedCommand={selectedCommand}
                    t={t}
                  />
                ) : null}

                {filePopupOpen ? (
                  <ComposerFilePopup
                    fileSearchState={fileSearchState}
                    onSelectMatch={insertWorkspaceMatch}
                    selectedMatch={selectedFileMatch}
                    t={t}
                  />
                ) : null}
              </div>,
              document.body,
            );
          })()
        : null}

      <div className="rounded-[1.35rem] border border-subtle/8 bg-card/84 px-3 py-2.5 shadow-sm">
        <Textarea
          autoFocus={isDesktop}
          className="min-h-[52px] max-h-[32vh] resize-none border-0 bg-transparent px-1 py-0.5 font-mono text-sm leading-6 shadow-none transition-shadow duration-200 placeholder:text-muted-foreground/45 focus-visible:ring-0"
          id="thread-composer"
          onClick={(event) => {
            setCaretPosition(
              event.currentTarget.selectionStart ??
                event.currentTarget.value.length,
            );
          }}
          onChange={(event) => {
            setComposerText(event.target.value);
            setCaretPosition(
              event.target.selectionStart ?? event.target.value.length,
            );
            setDismissedSlashToken(null);
            setDismissedMentionToken(null);
          }}
          onKeyDown={handleTextareaKeyDown}
          onSelect={(event) => {
            setCaretPosition(
              event.currentTarget.selectionStart ??
                event.currentTarget.value.length,
            );
          }}
          placeholder={t('detail.composer.placeholder')}
          ref={textareaRef}
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
                <span className="min-w-0 flex-1 truncate">
                  {selectedModelSummary}
                </span>
                <ChevronDown className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </SheetTrigger>

            <SheetContent
              className={cn(
                'gap-0 overflow-hidden border-subtle/10 bg-popover',
                !isDesktop ? 'max-h-[82vh] rounded-t-[1.5rem]' : '',
              )}
              side={isDesktop ? 'right' : 'bottom'}
            >
              <SheetHeader className="border-b border-subtle/6 pb-3">
                <SheetTitle>{t('detail.composer.settings.title')}</SheetTitle>
                <SheetDescription>
                  {t('detail.composer.settings.description')}
                </SheetDescription>
              </SheetHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                <ComposerSettingsSection
                  description={t('detail.composer.settings.modelDescription')}
                  title={t('detail.composer.settings.model')}
                >
                  {modelsState.kind === 'loading' &&
                  modelsState.models.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('detail.composer.settings.modelsLoading')}
                    </p>
                  ) : null}

                  {modelsState.kind === 'error' ? (
                    <div className="space-y-2 rounded-2xl border border-destructive/15 bg-destructive/5 p-3">
                      <p className="text-sm text-destructive">
                        {modelsState.message ??
                          t('detail.composer.settings.modelsLoadFailed')}
                      </p>
                      <Button
                        onClick={() => void reloadModels()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {t('detail.composer.settings.retry')}
                      </Button>
                    </div>
                  ) : null}

                  {modelsState.models.length > 0 ? (
                    <div className="space-y-1.5">
                      <Select
                        onValueChange={(id) => {
                          const model = modelsState.models.find(
                            (entry) => entry.id === id,
                          );
                          if (model) {
                            updateSettingsDraft((current) => ({
                              ...current,
                              model: model.model,
                              reasoningEffort:
                                normalizeReasoningEffortSelection(
                                  model,
                                  current.reasoningEffort,
                                ),
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
                  description={t(
                    'detail.composer.settings.reasoningDescription',
                  )}
                  title={t('detail.composer.settings.reasoning')}
                >
                  {selectedModel &&
                  selectedModel.supportedReasoningEfforts.length > 0 ? (
                    <div className="space-y-1.5">
                      <Select
                        onValueChange={(value) => {
                          updateSettingsDraft((current) => ({
                            ...current,
                            reasoningEffort: value as ReasoningEffort,
                          }));
                        }}
                        value={
                          settingsDraft.reasoningEffort ??
                          selectedModel.defaultReasoningEffort
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedModel.supportedReasoningEfforts.map(
                            (option) => (
                              <SelectItem
                                key={option.reasoningEffort}
                                value={option.reasoningEffort}
                              >
                                {formatReasoningEffortLabel(
                                  option.reasoningEffort,
                                  t,
                                )}
                              </SelectItem>
                            ),
                          )}
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
                      {t('detail.composer.settings.reasoningUnavailable')}
                    </p>
                  )}
                </ComposerSettingsSection>

                <ComposerSettingsSection
                  description={t(
                    'detail.composer.settings.permissionsDescription',
                  )}
                  title={t('detail.composer.settings.permissions')}
                >
                  <div className="space-y-1.5">
                    <Select
                      onValueChange={(value) => {
                        updateSettingsDraft((current) => ({
                          ...current,
                          permissionsPreset: value as ThreadPermissionPresetId,
                        }));
                      }}
                      value={settingsDraft.permissionsPreset ?? 'auto'}
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
                <span className="sr-only">{t('detail.action.stop')}</span>
              </Button>
            ) : (
              <Button
                className="size-7 rounded-full"
                disabled={!canSend}
                size="icon"
                type="submit"
              >
                <Send className="size-3" />
                <span className="sr-only">{t('detail.action.send')}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Sheet
        onOpenChange={(nextOpen) => {
          setRenameSheetOpen(nextOpen);
          if (!nextOpen) {
            setRenameDraft(thread.name ?? '');
          }
        }}
        open={renameSheetOpen}
      >
        <SheetContent
          className={cn(
            'gap-0 overflow-hidden border-subtle/10 bg-popover',
            !isDesktop ? 'max-h-[82vh] rounded-t-[1.5rem]' : '',
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (isDesktop) {
              renameInputRef.current?.focus();
              renameInputRef.current?.select();
            }
          }}
          side={isDesktop ? 'right' : 'bottom'}
        >
          <SheetHeader className="border-b border-subtle/6 pb-3">
            <SheetTitle>
              {thread.name
                ? t('detail.composer.rename.title')
                : t('detail.composer.rename.titleUnnamed')}
            </SheetTitle>
            <SheetDescription>
              {t('detail.composer.rename.description')}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 px-4 py-4">
            <Input
              onChange={(event) => {
                setRenameDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitRename();
                }
              }}
              placeholder={t('detail.composer.rename.placeholder')}
              ref={renameInputRef}
              value={renameDraft}
            />
            <div className="flex items-center gap-2">
              <Button
                disabled={commandActionPending}
                onClick={() => {
                  setRenameSheetOpen(false);
                }}
                type="button"
                variant="outline"
              >
                {t('common.cancel')}
              </Button>
              <Button
                className="ml-auto"
                disabled={
                  commandActionPending || renameDraft.trim().length === 0
                }
                onClick={() => {
                  void submitRename();
                }}
                type="button"
              >
                {t('detail.composer.rename.submit')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        onOpenChange={(nextOpen) => {
          setReviewSheetOpen(nextOpen);
          if (!nextOpen) {
            setReviewSheetMode('menu');
            setReviewInstructions('');
          }
        }}
        open={reviewSheetOpen}
      >
        <SheetContent
          className={cn(
            'gap-0 overflow-hidden border-subtle/10 bg-popover',
            !isDesktop ? 'max-h-[82vh] rounded-t-[1.5rem]' : '',
          )}
          side={isDesktop ? 'right' : 'bottom'}
        >
          <SheetHeader className="border-b border-subtle/6 pb-3">
            <SheetTitle>{t('detail.composer.review.title')}</SheetTitle>
            <SheetDescription>
              {t('detail.composer.review.description')}
            </SheetDescription>
          </SheetHeader>

          {reviewSheetMode === 'menu' ? (
            <div className="space-y-3 px-4 py-4">
              <Button
                className="w-full justify-start"
                disabled={commandActionPending}
                onClick={() => {
                  void submitSlashReview({ type: 'uncommittedChanges' });
                }}
                type="button"
                variant="outline"
              >
                {t('detail.composer.review.uncommitted')}
              </Button>
              <Button
                className="w-full justify-start"
                disabled={commandActionPending}
                onClick={() => {
                  setReviewSheetMode('custom');
                }}
                type="button"
                variant="outline"
              >
                {t('detail.composer.review.custom')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 px-4 py-4">
              <Textarea
                className="min-h-28 resize-y text-sm leading-6"
                onChange={(event) => {
                  setReviewInstructions(event.target.value);
                }}
                placeholder={t('detail.composer.review.customPlaceholder')}
                rows={5}
                value={reviewInstructions}
              />
              <div className="flex items-center gap-2">
                <Button
                  disabled={commandActionPending}
                  onClick={() => {
                    setReviewSheetMode('menu');
                  }}
                  type="button"
                  variant="outline"
                >
                  {t('detail.composer.review.back')}
                </Button>
                <Button
                  className="ml-auto"
                  disabled={
                    commandActionPending ||
                    reviewInstructions.trim().length === 0
                  }
                  onClick={() => {
                    void submitSlashReview({
                      type: 'custom',
                      instructions: reviewInstructions.trim(),
                    });
                  }}
                  type="button"
                >
                  {t('detail.composer.review.submit')}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </form>
  );
}

function ContextUsageButton({
  usage,
}: {
  usage: ThreadDetail['contextUsage'];
}) {
  const { t } = useI18n();
  const percentUsed = getContextUsagePercent(usage);
  const usedTokens = usage?.last.inputTokens ?? null;
  const totalWindow = usage?.modelContextWindow ?? null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-80"
          type="button"
        >
          <ContextUsageRing percentUsed={percentUsed} />
          <span className="sr-only">{t('detail.composer.context.title')}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" collisionPadding={12} className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t('detail.composer.context.title')}</PopoverTitle>
        </PopoverHeader>

        {usage ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <ContextUsageStat
                label={t('detail.composer.context.percent')}
                value={
                  percentUsed !== null
                    ? `${Math.round(percentUsed)}%`
                    : t('detail.composer.context.unavailable')
                }
                valueClassName={
                  CONTEXT_USAGE_STYLES[getContextUsageLevel(percentUsed)]
                    .textClass
                }
              />
              <ContextUsageStat
                label={t('detail.composer.context.used')}
                value={
                  usedTokens !== null
                    ? formatTokenCount(usedTokens)
                    : t('detail.composer.context.unavailable')
                }
              />
              <ContextUsageStat
                label={t('detail.composer.context.window')}
                value={
                  totalWindow !== null
                    ? formatTokenCount(totalWindow)
                    : t('detail.composer.context.unavailable')
                }
              />
              <ContextUsageStat
                label={t('detail.composer.context.latestTurn')}
                value={formatTokenCount(usage.last.totalTokens)}
              />
            </div>

            <div className="flex items-center justify-between rounded-sm border border-subtle/8 bg-background/60 p-3 text-sm text-muted-foreground">
              <span>{t('detail.composer.context.totalUsed')}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatTokenCount(usage.total.totalTokens)}
              </span>
            </div>

            <div className="rounded-lg border border-subtle/8 bg-background/60 p-3">
              <div className="flex items-center justify-between text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span>{t('detail.composer.context.breakdown')}</span>
                <span>{formatTokenCount(usage.last.totalTokens)}</span>
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>{t('detail.composer.context.input')}</span>
                  <span>{formatTokenCount(usage.last.inputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('detail.composer.context.cached')}</span>
                  <span>{formatTokenCount(usage.last.cachedInputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('detail.composer.context.output')}</span>
                  <span>{formatTokenCount(usage.last.outputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('detail.composer.context.reasoning')}</span>
                  <span>
                    {formatTokenCount(usage.last.reasoningOutputTokens)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('detail.composer.context.unavailableDescription')}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ComposerCommandPopup({
  commands,
  onExecuteCommand,
  selectedCommand,
  t,
}: {
  commands: SupportedComposerCommand[];
  onExecuteCommand: (command: SupportedComposerCommand) => void;
  selectedCommand: SupportedComposerCommand | null;
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-subtle/8 bg-popover shadow-lg">
      <div className="border-b border-subtle/6 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {t('detail.composer.popup.commands')}
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {commands.map((command) => {
          const selected = selectedCommand?.id === command.id;
          return (
            <button
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                selected ? 'bg-accent/70' : 'hover:bg-accent/40',
              )}
              key={command.id}
              onClick={() => {
                onExecuteCommand(command);
              }}
              type="button"
            >
              <span className="rounded-md border border-subtle/8 bg-background/72 px-2 py-0.5 font-mono text-xs text-foreground">
                /{command.command}
              </span>
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                {t(command.descriptionKey)}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Tab
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ComposerFilePopup({
  fileSearchState,
  onSelectMatch,
  selectedMatch,
  t,
}: {
  fileSearchState: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    query: string;
    matches: WorkspaceSearchMatch[];
    message?: string;
  };
  onSelectMatch: (match: WorkspaceSearchMatch) => void;
  selectedMatch: WorkspaceSearchMatch | null;
  t: (key: string) => string;
}) {
  let body: ReactNode = null;

  if (fileSearchState.status === 'loading') {
    body = (
      <p className="px-3 py-3 text-sm text-muted-foreground">
        {t('detail.composer.popup.loadingFiles')}
      </p>
    );
  } else if (fileSearchState.status === 'error') {
    body = (
      <p className="px-3 py-3 text-sm text-destructive">
        {fileSearchState.message ?? t('detail.workspace.error.directory')}
      </p>
    );
  } else if (fileSearchState.query.length === 0) {
    body = (
      <p className="px-3 py-3 text-sm text-muted-foreground">
        {t('detail.composer.popup.typeToSearchFiles')}
      </p>
    );
  } else if (fileSearchState.matches.length === 0) {
    body = (
      <p className="px-3 py-3 text-sm text-muted-foreground">
        {t('detail.composer.popup.noFiles')}
      </p>
    );
  } else {
    body = (
      <div className="max-h-56 overflow-y-auto py-1">
        {fileSearchState.matches.map((match) => {
          const selected = selectedMatch?.path === match.path;
          return (
            <button
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                selected ? 'bg-accent/70' : 'hover:bg-accent/40',
              )}
              key={match.path}
              onClick={() => {
                onSelectMatch(match);
              }}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                {match.path}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-subtle/8 bg-popover shadow-lg">
      <div className="border-b border-subtle/6 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {t('detail.composer.popup.files')}
      </div>
      {body}
    </div>
  );
}

function ComposerSettingsSection({
  children,
  description,
  title,
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
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-subtle/8 bg-background/60 px-2.5 py-2">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-base font-medium',
          valueClassName ?? 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ContextUsageRing({ percentUsed }: { percentUsed: number | null }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent =
    percentUsed === null ? null : Math.max(0, Math.min(percentUsed, 100));
  const progress = clampedPercent === null ? 0 : clampedPercent / 100;
  const dashOffset = circumference * (1 - progress);
  const trackColor = 'var(--color-border)';
  const arcColor =
    CONTEXT_USAGE_STYLES[getContextUsageLevel(clampedPercent)].cssVar;

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
          style={{
            transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease',
          }}
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

function buildComposerSettingsDraft(
  settings: ThreadSettings | null,
): ThreadSettings {
  return (
    settings ?? {
      model: null,
      reasoningEffort: null,
      permissionsPreset: null,
    }
  );
}

function stripSlashCommandPrefix(text: string): string {
  const submission = parseSlashCommandSubmission(text);
  if (!submission) {
    return text;
  }

  const token = `/${submission.commandName}`;
  if (!text.startsWith(token)) {
    return text;
  }

  return text.slice(token.length).replace(/^\s+/, '');
}

function buildTurnSettingsOverrides(
  current: ThreadSettings | null,
  draft: ThreadSettings,
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
  modelId: string | null,
): AvailableModel | null {
  if (!modelId) {
    return null;
  }

  return (
    models.find((model) => model.model === modelId || model.id === modelId) ??
    null
  );
}

function normalizeReasoningEffortSelection(
  model: AvailableModel,
  current: ReasoningEffort | null,
): ReasoningEffort | null {
  if (model.supportedReasoningEfforts.length === 0) {
    return current;
  }

  if (
    current &&
    model.supportedReasoningEfforts.some(
      (option) => option.reasoningEffort === current,
    )
  ) {
    return current;
  }

  return model.defaultReasoningEffort;
}

function formatModelTriggerText(
  settings: ThreadSettings,
  models: AvailableModel[],
  fallback: string,
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
  t: (key: string) => string,
): string {
  switch (effort) {
    case 'none':
      return t('detail.composer.settings.reasoning.none');
    case 'minimal':
      return t('detail.composer.settings.reasoning.minimal');
    case 'low':
      return t('detail.composer.settings.reasoning.low');
    case 'medium':
      return t('detail.composer.settings.reasoning.medium');
    case 'high':
      return t('detail.composer.settings.reasoning.high');
    case 'xhigh':
      return t('detail.composer.settings.reasoning.xhigh');
  }
}

function getPermissionPresetOptions(t: (key: string) => string): Array<{
  id: ThreadPermissionPresetId;
  label: string;
  description: string;
}> {
  return [
    {
      id: 'read-only',
      label: t('detail.composer.settings.permissions.readOnly'),
      description: t(
        'detail.composer.settings.permissions.readOnlyDescription',
      ),
    },
    {
      id: 'auto',
      label: t('detail.composer.settings.permissions.default'),
      description: t('detail.composer.settings.permissions.defaultDescription'),
    },
    {
      id: 'full-access',
      label: t('detail.composer.settings.permissions.fullAccess'),
      description: t(
        'detail.composer.settings.permissions.fullAccessDescription',
      ),
    },
  ];
}

type ContextUsageLevel = 'idle' | 'low' | 'medium' | 'high';

const CONTEXT_USAGE_STYLES: Record<
  ContextUsageLevel,
  { cssVar: string; textClass: string }
> = {
  idle: {
    cssVar: 'var(--color-muted-foreground)',
    textClass: 'text-muted-foreground',
  },
  low: { cssVar: 'var(--color-primary)', textClass: 'text-primary' },
  medium: { cssVar: 'var(--color-chart-2)', textClass: 'text-chart-2' },
  high: { cssVar: 'var(--color-destructive)', textClass: 'text-destructive' },
};

function getContextUsageLevel(percent: number | null): ContextUsageLevel {
  if (percent === null) return 'idle';
  if (percent < 50) return 'low';
  if (percent < 80) return 'medium';
  return 'high';
}

function getContextUsagePercent(
  usage: ThreadDetail['contextUsage'],
): number | null {
  if (!usage || !usage.modelContextWindow || usage.modelContextWindow <= 0) {
    return null;
  }

  return (usage.last.inputTokens / usage.modelContextWindow) * 100;
}
