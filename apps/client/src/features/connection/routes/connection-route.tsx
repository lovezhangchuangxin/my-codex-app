import { useCallback, useEffect, useState } from "react";
import { Activity, Cable, KeyRound, RadioTower, RefreshCcw, Shield } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  bridgeAccessToken,
  bridgeBaseUrl,
  bridgeHealthUrl,
  connectionModeLabel
} from "@/lib/env";
import { useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";
import { formatTimestamp } from "@/features/threads/lib/thread-utils";

type HealthState =
  | { checkedAt?: number; status: "checking" }
  | { checkedAt: number; status: "ok" }
  | { checkedAt: number; message: string; status: "error" };

export function ConnectionRoute() {
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const [healthState, setHealthState] = useState<HealthState>({ status: "checking" });

  const checkHealth = useCallback(async () => {
    setHealthState((current) => ({
      status: "checking",
      ...(current.checkedAt ? { checkedAt: current.checkedAt } : {})
    }));

    try {
      const response = await fetch(bridgeHealthUrl);
      if (!response.ok) {
        throw new Error(`Health check failed with ${response.status}`);
      }

      setHealthState({
        checkedAt: Math.floor(Date.now() / 1000),
        status: "ok"
      });
    } catch (error) {
      setHealthState({
        checkedAt: Math.floor(Date.now() / 1000),
        message: error instanceof Error ? error.message : "Unknown bridge error",
        status: "error"
      });
    }
  }, []);

  useEffect(() => {
    void checkHealth();

    const intervalId = window.setInterval(() => {
      void checkHealth();
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [checkHealth]);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void checkHealth();
              }}
              variant="outline"
            >
              <Activity className="size-4" />
              Check health
            </Button>
            <Button
              onClick={() => {
                void runtime.loadThreads();
              }}
              variant="outline"
            >
              <RefreshCcw className="size-4" />
              Refresh threads
            </Button>
          </div>
        }
        description="Inspect the current bridge endpoint, bootstrap auth state, and the live client runtime signals exposed by the existing local bridge implementation."
        eyebrow="Diagnostics"
        title="Connection"
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <FactCard
          description={bridgeBaseUrl}
          icon={<Cable className="size-5 text-primary" />}
          title="Bridge endpoint"
          value={connectionModeLabel}
        />
        <FactCard
          description={bridgeHealthUrl}
          icon={<RadioTower className="size-5 text-primary" />}
          title="Health check"
          value={healthState.status === "ok" ? "Reachable" : healthState.status === "error" ? "Unavailable" : "Checking"}
        />
        <FactCard
          description={bridgeAccessToken ? "Bootstrap token configured" : "Bootstrap token missing"}
          icon={<KeyRound className="size-5 text-primary" />}
          title="Bootstrap auth"
          value={bridgeAccessToken ? "Configured" : "Not configured"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border border-border/70 bg-card/88 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="text-xl">Runtime snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            <StatusFact label="Thread list state" value={snapshot.threads.kind} />
            <StatusFact label="Detail state" value={snapshot.detail.kind} />
            <StatusFact
              label="Selected thread"
              value={snapshot.selectedThreadId ?? "None"}
            />
            <StatusFact
              label="Pending request mutations"
              value={String(snapshot.mutations.respondingRequestIds.length)}
            />
            <StatusFact
              label="Send message pending"
              value={snapshot.mutations.sendMessagePending ? "Yes" : "No"}
            />
            <StatusFact
              label="Interrupt pending"
              value={snapshot.mutations.interruptPending ? "Yes" : "No"}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border border-border/70 bg-card/88 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Shield className="size-5 text-primary" />
                Bridge health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    healthState.status === "ok"
                      ? "bg-emerald-500/12 text-emerald-700"
                      : healthState.status === "error"
                        ? "bg-destructive/12 text-destructive"
                        : "bg-primary/12 text-primary"
                  }
                  variant="secondary"
                >
                  {healthState.status}
                </Badge>
                {"checkedAt" in healthState && healthState.checkedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Last check {formatTimestamp(healthState.checkedAt)}
                  </span>
                ) : null}
              </div>
              {healthState.status === "error" ? (
                <Alert className="border-destructive/20 bg-destructive/5">
                  <AlertTitle>Bridge health failed</AlertTitle>
                  <AlertDescription>{healthState.message}</AlertDescription>
                </Alert>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  Health checks only verify the bridge HTTP surface. Thread list and event
                  sync are still validated separately by the client runtime.
                </p>
              )}
            </CardContent>
          </Card>

          {snapshot.mutations.lastError ? (
            <Alert className="border-destructive/20 bg-destructive/5">
              <AlertTitle>Latest client mutation error</AlertTitle>
              <AlertDescription>{snapshot.mutations.lastError}</AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-primary/15 bg-primary/5">
              <AlertTitle>Current limitation</AlertTitle>
              <AlertDescription>
                This page reflects the bridge APIs available today. Pairing, relay, and
                device trust are intentionally out of scope until those bridge endpoints
                exist.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function FactCard({
  description,
  icon,
  title,
  value
}: {
  description: string;
  icon: import("react").ReactNode;
  title: string;
  value: string;
}) {
  return (
    <Card className="border border-border/70 bg-card/88 shadow-[0_24px_64px_rgba(65,46,23,0.08)]">
      <CardHeader className="gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
          {icon}
        </div>
        <div className="space-y-1">
          <CardTitle className="text-xl">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-3xl tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}
