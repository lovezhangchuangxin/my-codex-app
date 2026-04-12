import { cn } from "@/lib/utils";
import { formatConnectionKind } from "@/lib/runtime/connection-utils";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";

export function ConnectionIndicator() {
  const snapshot = useRuntimeSnapshot();
  const { kind } = snapshot.connection;

  const color =
    kind === "authenticated"
      ? "bg-emerald-500"
      : kind === "reconnecting" || kind === "refreshing" || kind === "resyncing"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="hidden items-center gap-2 lg:flex" role="status">
      <span className={cn("size-2 rounded-full", color)} aria-hidden="true" />
      <span className="font-mono text-xs text-muted-foreground">{formatConnectionKind(kind)}</span>
    </div>
  );
}
