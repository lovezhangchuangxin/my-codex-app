import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'bash',
  console: 'bash',
  shell: 'bash',
  sh: 'bash',
  ts: 'typescript',
  tsx: 'tsx',
  yml: 'yaml',
};

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('yaml', yaml);

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
  highlightLine,
  language,
  shellPrompt = false,
}: {
  children: string;
  className?: string | undefined;
  chrome?: boolean;
  highlightLine?: number | null | undefined;
  language?: string | undefined;
  shellPrompt?: boolean;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const content = useMemo(() => children.replace(/\n$/, ''), [children]);

  useEffect(() => {
    if (highlightLine == null || !containerRef.current) return;
    const codeEl = containerRef.current.querySelector('code');
    if (!codeEl) return;
    const lines = codeEl.children;
    const targetIndex = highlightLine - 1;
    if (targetIndex >= 0 && targetIndex < lines.length) {
      const targetEl = lines[targetIndex] as HTMLElement;
      targetEl.style.background = 'rgba(78, 222, 163, 0.12)';
      targetEl.style.borderRadius = '3px';
      targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return () => {
        targetEl.style.background = '';
        targetEl.style.borderRadius = '';
      };
    }
  }, [highlightLine, content]);

  async function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
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
        'not-prose overflow-hidden rounded-lg border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]',
        !chrome && 'rounded-xl border-0 bg-transparent shadow-none',
        className,
      )}
    >
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-b border-subtle/6 bg-subtle/4 px-3 py-1.5">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-2 rounded-full bg-destructive/45" />
              <span className="size-2 rounded-full bg-secondary/55" />
              <span className="size-2 rounded-full bg-primary/55" />
            </div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
              {language ??
                (shellPrompt ? t('codeBlock.shell') : t('codeBlock.plainText'))}
            </p>
          </div>
          <Button
            className={cn(
              'h-6 rounded-md px-2 font-mono text-[0.7rem] uppercase tracking-[0.12em] transition-colors',
              copied && 'text-primary hover:text-primary',
            )}
            onClick={() => {
              void handleCopy();
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? t('codeBlock.copied') : t('codeBlock.copy')}
          </Button>
        </div>
      ) : null}

      <div className="relative" ref={containerRef}>
        {shellPrompt ? (
          <span className="pointer-events-none absolute top-4 left-4 z-10 font-mono text-xs text-primary">
            $
          </span>
        ) : null}
        <SyntaxHighlighter
          PreTag="div"
          className="code-block-body"
          codeTagProps={{
            className: 'font-mono text-[0.8rem]',
          }}
          customStyle={{
            background: 'transparent',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            lineHeight: '1.65',
            margin: 0,
            overflowX: 'auto',
            padding: shellPrompt ? '1rem 1rem 1rem 2rem' : '1rem',
          }}
          language={language ?? 'text'}
          style={theme === 'light' ? oneLight : oneDark}
          wrapLongLines
          wrapLines
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
