import AnsiToHtml from "ansi-to-html";
import { useMemo } from "react";

import { CodeBlock } from "@/components/common/code-block";
import { cn } from "@/lib/utils";

const ansiConverter = new AnsiToHtml({
  bg: "#111317",
  fg: "#e8e8eb",
  newline: true,
  escapeXML: true
});

const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/;

export function TerminalOutput({
  className,
  content
}: {
  className?: string;
  content: string;
}) {
  const hasAnsi = ANSI_PATTERN.test(content);
  const html = useMemo(() => ansiConverter.toHtml(content), [content]);

  if (!hasAnsi) {
    return (
      <CodeBlock className={className}>
        {content}
      </CodeBlock>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(10,12,14,0.94),rgba(16,18,20,0.98))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/6 bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(78,222,163,0.05))] px-3 py-2.5">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary/85">
            Terminal output
          </p>
          <p className="text-xs text-muted-foreground">Live command log with ANSI color support</p>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <pre
          className="m-0 whitespace-pre-wrap break-words font-mono text-[0.8rem] leading-[1.65] text-foreground [&_span]:font-inherit"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
