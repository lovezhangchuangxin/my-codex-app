import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ConnectionSection } from '@/components/settings/connection-section';
import { DevicesSection } from '@/components/settings/devices-section';
import { LanguageSection } from '@/components/settings/language-section';
import { ThemeSection } from '@/components/settings/theme-section';
import { useI18n } from '@/lib/i18n/use-i18n';

export function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full border-l border-subtle/6 bg-card/95 sm:max-w-md"
        side="right"
      >
        <SheetHeader>
          <SheetTitle>{t('settings.title')}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
          <ThemeSection />
          <Separator className="bg-subtle/6" />
          <LanguageSection />
          <Separator className="bg-subtle/6" />
          <ConnectionSection />
          <Separator className="bg-subtle/6" />
          <DevicesSection />
          <Separator className="bg-subtle/6" />
          <div className="space-y-1">
            <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              {t('settings.about.title')}
            </h3>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('settings.about.version', { version: 'v0.1.0' })}
              </p>
              <a
                href="https://github.com/lovezhangchuangxin/my-codex-app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
