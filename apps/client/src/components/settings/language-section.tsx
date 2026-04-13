import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';

const localeOptions = [
  { key: 'en' as const, nativeLabel: 'English' },
  { key: 'zh-CN' as const, nativeLabel: '简体中文' },
];

export function LanguageSection() {
  const { locale, setLocale, t } = useI18n();

  const currentLanguageLabel =
    localeOptions.find((o) => o.key === locale)?.nativeLabel ?? locale;

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        {t('settings.language.title')}
      </h3>

      <div className="space-y-3 rounded-xl border border-subtle/8 bg-background/42 p-3">
        <div className="space-y-1">
          <p className="text-sm text-foreground">
            {t('settings.language.description')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('settings.language.current', { language: currentLanguageLabel })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {localeOptions.map((option) => {
            const isActive = locale === option.key;

            return (
              <Button
                className={cn(
                  'justify-center',
                  isActive &&
                    'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15',
                )}
                key={option.key}
                onClick={() => {
                  setLocale(option.key);
                }}
                size="sm"
                variant={isActive ? 'secondary' : 'outline'}
              >
                {option.nativeLabel}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
