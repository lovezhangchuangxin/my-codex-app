import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeSection() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        Theme
      </h3>

      <div className="space-y-3 rounded-xl border border-subtle/8 bg-background/42 p-3">
        <div className="space-y-1">
          <p className="text-sm text-foreground">Appearance</p>
          <p className="text-xs text-muted-foreground">
            Current: {themes.find((t) => t.name === theme)?.label}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {themes.map((t) => {
            const isActive = theme === t.name;

            return (
              <Button
                className={cn(
                  "justify-center",
                  isActive && "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                )}
                key={t.name}
                onClick={() => {
                  setTheme(t.name);
                }}
                size="sm"
                variant={isActive ? "secondary" : "outline"}
              >
                {t.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
