import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ConnectionSection } from "@/components/settings/connection-section";
import { DevicesSection } from "@/components/settings/devices-section";

export function SettingsSheet({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-l border-white/6 bg-card/95 sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 px-4 py-4">
          <ConnectionSection />
          <Separator className="bg-white/6" />
          <DevicesSection />
          <Separator className="bg-white/6" />
          <div className="space-y-1">
            <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              About
            </h3>
            <p className="text-sm text-muted-foreground">My Codex App v0.1.0</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
