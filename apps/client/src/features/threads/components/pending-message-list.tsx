import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { PendingMessage } from '@my-codex-app/sdk';

export function PendingMessageList({
  messages,
  onCancel,
}: {
  messages: PendingMessage[];
  onCancel: (index: number) => void;
}) {
  const { t } = useI18n();

  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="shrink-0 border-t border-subtle/6 bg-muted/30 px-4 py-2 md:px-5"
    >
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t('detail.pendingMessages.label')}
      </div>
      <ul className="space-y-1">
        {messages.map((msg, index) => (
          <li
            key={index}
            className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{msg.text}</span>
            <Button
              className="size-6 shrink-0 rounded-full"
              onClick={() => onCancel(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="size-3" />
              <span className="sr-only">
                {t('detail.pendingMessages.cancel')}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
