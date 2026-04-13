import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';

const themeLabelKeys = {
  dark: 'settings.theme.dark' as const,
  light: 'settings.theme.light' as const,
};

export function ThemeSection() {
  const { theme, setTheme, themes } = useTheme();
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        {t('settings.theme.title')}
      </h3>

      <div className="space-y-3 rounded-xl border border-subtle/8 bg-background/42 p-3">
        <div className="space-y-1">
          <p className="text-sm text-foreground">
            {t('settings.theme.appearance')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {themes.map((themeOpt) => {
            const isActive = theme === themeOpt.name;

            return (
              <Button
                className={cn(
                  'justify-center',
                  isActive &&
                    'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15',
                )}
                key={themeOpt.name}
                onClick={() => {
                  setTheme(themeOpt.name);
                }}
                size="sm"
                variant={isActive ? 'secondary' : 'outline'}
              >
                {themeLabelKeys[themeOpt.name]
                  ? t(themeLabelKeys[themeOpt.name])
                  : themeOpt.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
