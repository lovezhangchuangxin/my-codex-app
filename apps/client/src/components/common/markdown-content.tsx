import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock, parseCodeLanguage } from "@/components/common/code-block";
import { cn } from "@/lib/utils";

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  node?: unknown;
};

export function MarkdownContent({
  className,
  content
}: {
  className?: string;
  content: string;
}) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        components={{
          a: ({ children, href, ...props }) => (
            <a
              {...props}
              className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary/80"
              href={href}
              rel="noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          code: ({ children, className: codeClassName, inline }: MarkdownCodeProps) => {
            const renderedChildren = toCodeContent(children);
            const language = parseCodeLanguage(codeClassName);
            const isInlineCode =
              inline ??
              (!language &&
                !renderedChildren.includes("\n") &&
                renderedChildren.trim().length > 0);

            if (isInlineCode) {
              return (
                <code className="rounded-md border border-white/8 bg-white/6 px-1.5 py-0.5 font-mono text-[0.82em] text-foreground">
                  {renderedChildren}
                </code>
              );
            }

            return (
              <CodeBlock language={language}>
                {renderedChildren}
              </CodeBlock>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table>{children}</table>
            </div>
          )
        }}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function toCodeContent(children: ReactNode) {
  if (typeof children === "string") {
    return children;
  }

  if (Array.isArray(children)) {
    return children.join("");
  }

  return String(children ?? "");
}
