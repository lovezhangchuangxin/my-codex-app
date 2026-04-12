import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ConnectionSection } from "@/components/settings/connection-section";
import { DevicesSection } from "@/components/settings/devices-section";
import { LanguageSection } from "@/components/settings/language-section";
import { ThemeSection } from "@/components/settings/theme-section";
import { useI18n } from "@/lib/i18n/use-i18n";

export function SettingsSheet({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-l border-subtle/6 bg-card/95 sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{t("settings.title")}</SheetTitle>
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
              {t("settings.about.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("settings.about.version", { version: "v0.1.0" })}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
