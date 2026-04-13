import AnsiToHtml from 'ansi-to-html';
import { useMemo } from 'react';

import { CodeBlock } from '@/components/common/code-block';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ANSI_PATTERN = new RegExp(String.raw`\u001b\[[0-9;?]*[ -/]*[@-~]`);

export function TerminalOutput({
  className,
  content,
}: {
  className?: string;
  content: string;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const hasAnsi = ANSI_PATTERN.test(content);

  const ansiConverter = useMemo(
    () =>
      new AnsiToHtml({
        bg: isLight ? '#f5f5f7' : '#111317',
        fg: isLight ? '#1e1e22' : '#e8e8eb',
        newline: true,
        escapeXML: true,
      }),
    [isLight],
  );

  const html = useMemo(
    () => ansiConverter.toHtml(content),
    [content, ansiConverter],
  );

  if (!hasAnsi) {
    return <CodeBlock className={className}>{content}</CodeBlock>;
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-subtle/8 bg-code-bg shadow-[inset_0_0_0_1px_var(--color-subtle)/3]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-subtle/6 bg-subtle/4 px-3 py-1.5">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary/85">
            {t('terminalOutput.title')}
          </p>
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
