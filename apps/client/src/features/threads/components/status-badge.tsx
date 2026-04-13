import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeTone =
  | "active"
  | "error"
  | "neutral"
  | "waitingApproval"
  | "waitingInput";

export function StatusBadge({
  label,
  tone
}: {
  label: string;
  tone: StatusBadgeTone;
}) {
  const classes =
    tone === "waitingApproval"
      ? "bg-secondary/16 text-secondary pulse-secondary"
      : tone === "waitingInput"
        ? "bg-primary/12 text-primary"
        : tone === "active"
          ? "bg-primary/12 text-primary"
          : tone === "error"
            ? "bg-destructive/12 text-destructive"
            : "bg-background/70 text-muted-foreground";

  return (
    <Badge className={cn("border-0 font-mono text-[0.7rem] uppercase", classes)} variant="secondary">
      {label}
    </Badge>
  );
}
