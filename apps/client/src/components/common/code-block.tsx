import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { PrismAsyncLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "bash",
  console: "bash",
  shell: "bash",
  sh: "bash",
  ts: "typescript",
  tsx: "tsx",
  yml: "yaml"
};

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("diff", diff);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

export function parseCodeLanguage(className?: string) {
  const match = className?.match(/language-([\w-]+)/i);
  const rawLanguage = match?.[1]?.toLowerCase();

  if (!rawLanguage) {
    return undefined;
  }

  return LANGUAGE_ALIASES[rawLanguage] ?? rawLanguage;
}

export function CodeBlock({
  children,
  className,
  chrome = true,
  language,
  shellPrompt = false
}: {
  children: string;
  className?: string | undefined;
  chrome?: boolean;
  language?: string | undefined;
  shellPrompt?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const content = useMemo(() => children.replace(/\n$/, ""), [children]);

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1600);
  }

  return (
    <div
      className={cn(
        "not-prose overflow-hidden rounded-2xl border border-white/8 bg-[#111317] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
        !chrome && "rounded-xl border-0 bg-transparent shadow-none",
        className
      )}
    >
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/6 bg-white/4 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-destructive/45" />
              <span className="size-2.5 rounded-full bg-secondary/55" />
              <span className="size-2.5 rounded-full bg-primary/55" />
            </div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {language ?? (shellPrompt ? "shell" : "plain text")}
            </p>
          </div>
          <Button
            className="h-7 rounded-md px-2.5 font-mono text-[0.7rem] uppercase tracking-[0.12em]"
            onClick={() => {
              void handleCopy();
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}

      <div className="relative">
        {shellPrompt ? (
          <span className="pointer-events-none absolute top-4 left-4 z-10 font-mono text-xs text-primary">
            $
          </span>
        ) : null}
        <SyntaxHighlighter
          PreTag="div"
          className="code-block-body"
          codeTagProps={{
            className: "font-mono text-[0.8rem]"
          }}
          customStyle={{
            background: "transparent",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            lineHeight: "1.65",
            margin: 0,
            overflowX: "auto",
            padding: shellPrompt ? "1rem 1rem 1rem 2rem" : "1rem"
          }}
          language={language ?? "text"}
          style={oneDark}
          wrapLongLines
          wrapLines
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
