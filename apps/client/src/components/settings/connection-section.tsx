import { RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { bridgeBaseUrl } from "@/lib/env";
import { formatConnectionKind } from "@/lib/runtime/connection-utils";
import { useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";
import { cn } from "@/lib/utils";

export function ConnectionSection() {
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const { kind, message } = snapshot.connection;

  const color =
    kind === "authenticated"
      ? "bg-emerald-500"
      : kind === "reconnecting" || kind === "refreshing" || kind === "resyncing"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        Connection
      </h3>

      <div className="space-y-2 rounded-xl border border-white/8 bg-background/42 p-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", color)} />
          <span className="text-sm font-medium text-foreground">{formatConnectionKind(kind)}</span>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{bridgeBaseUrl}</p>
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
        <Button
          className="w-full"
          onClick={() => {
            void runtime.retryConnection();
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCcw className="size-3.5" />
          Reconnect
        </Button>
      </div>
    </div>
  );
}
