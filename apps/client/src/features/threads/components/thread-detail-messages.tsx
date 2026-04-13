import {
  lazy,
  Suspense,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import {
  Brain,
  ChevronDown,
  ExternalLink,
  FileCode2,
  GalleryHorizontal,
  Search,
  SquareTerminal
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatusBadge } from "@/features/threads/components/status-badge";
import {
  getCommandDisplay,
  looksLikeMarkdownContent
} from "@/features/threads/components/thread-detail-utils";
import type { FlatThreadItem } from "@/features/threads/lib/thread-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { ThreadItem } from "@my-codex-app/protocol";

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

export function ThreadMessageStream({
  flatItems,
  onFilePathClick,
  onOpenWorkspacePath,
  resolveWorkspacePath,
  scrollRef
}: {
  flatItems: FlatThreadItem[];
  onFilePathClick?: ((href: string) => void) | undefined;
  onOpenWorkspacePath: (path: string) => void;
  resolveWorkspacePath: (candidatePath: string) => string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-4 md:px-5"
      ref={scrollRef}
    >
      <div className="mx-auto max-w-3xl space-y-4 pb-4">
        {flatItems.map((item) => (
          <FlatItemRenderer
            item={item}
            key={`${item.turnId}-${item.id}`}
            onFilePathClick={onFilePathClick}
            onOpenWorkspacePath={onOpenWorkspacePath}
            resolveWorkspacePath={resolveWorkspacePath}
          />
        ))}
      </div>
    </div>
  );
}

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
            <UserInputRenderer
              input={input}
              key={`${item.id}-${index}`}
              onFilePathClick={onFilePathClick}
            />
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

function UserMessageBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-subtle/[0.06] px-4 py-3">
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function AgentMessageBlock({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="hidden size-6 shrink-0 items-center justify-center rounded-lg bg-primary/12 lg:flex">
        <img alt="" className="size-4" src="/openai.svg" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
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
        <ChevronDown
          className={cn("size-3 transition-transform duration-200", !open ? "-rotate-90" : "")}
        />
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
                <div className="rounded-lg bg-background/50 px-3 py-2" key={index}>
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
    <Collapsible className="overflow-hidden rounded-xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3] lg:ml-9">
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
                    <Button className="text-muted-foreground" size="xs" variant="ghost">
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
    <div className="space-y-1.5 lg:ml-9">
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
                  <Button className="text-muted-foreground" size="xs" variant="ghost">
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

function ToolLabel({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-accent/60 px-2.5 py-1.5 text-muted-foreground lg:ml-9">
      {icon}
      <span className="font-mono text-[0.7rem] uppercase tracking-wide">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{value}</span>
    </div>
  );
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
      return (
        <StructuredUserInput
          label={t("detail.userInput.skill")}
          value={`${input.name} (${input.path})`}
        />
      );
    case "mention":
      return (
        <StructuredUserInput
          label={t("detail.userInput.mention")}
          value={`${input.name} (${input.path})`}
        />
      );
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
      <LazyMarkdownContent
        {...(className ? { className } : {})}
        content={content}
        onFilePathClick={onFilePathClick}
      />
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
          shellPrompt ? "pl-8" : ""
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
