import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  WorkspaceSyntaxHighlighter,
  oneDark,
  oneLight,
  resolveWorkspaceCodeLanguage,
} from '@/lib/workspace-code-language';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

export function CodeViewer({
  children,
  className,
  highlightLine,
  language,
  showLineNumbers = true,
}: {
  children: string;
  className?: string | undefined;
  highlightLine?: number | null | undefined;
  language?: string | undefined;
  showLineNumbers?: boolean | undefined;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const content = useMemo(() => children.replace(/\n$/, ''), [children]);
  const resolvedLanguage = useMemo(
    () => resolveWorkspaceCodeLanguage(language),
    [language],
  );

  useEffect(() => {
    if (highlightLine == null || !containerRef.current) {
      return;
    }

    const target = containerRef.current.querySelector<HTMLElement>(
      `[data-line-number="${highlightLine}"]`,
    );
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [content, highlightLine]);

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
        'overflow-hidden rounded-xl border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-subtle/6 bg-subtle/4 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {language ?? t('codeBlock.plainText')}
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

      <div className="overflow-x-auto" ref={containerRef}>
        <WorkspaceSyntaxHighlighter
          PreTag="div"
          className="code-viewer-body"
          codeTagProps={{
            className: 'font-mono text-[0.82rem]',
          }}
          customStyle={{
            background: 'transparent',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            lineHeight: '1.7',
            margin: 0,
            minWidth: '100%',
            overflowX: 'visible',
            padding: '1rem 0',
          }}
          language={resolvedLanguage ?? 'text'}
          lineNumberStyle={(lineNumber) => ({
            color:
              lineNumber === highlightLine
                ? 'var(--color-foreground)'
                : 'var(--color-muted-foreground)',
            display: 'inline-block',
            minWidth: '3.5rem',
            opacity: lineNumber === highlightLine ? 0.9 : 0.58,
            paddingLeft: '1rem',
            paddingRight: '1rem',
            textAlign: 'right',
            userSelect: 'none',
          })}
          lineProps={(lineNumber) => ({
            'data-line-number': String(lineNumber),
            style: {
              backgroundColor:
                lineNumber === highlightLine
                  ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                  : 'transparent',
              boxShadow:
                lineNumber === highlightLine
                  ? 'inset 2px 0 0 color-mix(in srgb, var(--primary) 80%, transparent)'
                  : 'none',
              display: 'block',
              minWidth: '100%',
              paddingRight: '1rem',
            },
          })}
          showLineNumbers={showLineNumbers}
          style={theme === 'light' ? oneLight : oneDark}
          wrapLines
        >
          {content}
        </WorkspaceSyntaxHighlighter>
      </div>
    </div>
  );
}
