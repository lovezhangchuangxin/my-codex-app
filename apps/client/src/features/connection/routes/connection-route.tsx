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
  const diagnosticFeed = buildDiagnosticFeed({
    healthState,
    lastError: snapshot.mutations.lastError,
    selectedThreadId: snapshot.selectedThreadId,
    snapshot
  });

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
    <div className="space-y-5">
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
        description="Inspect bridge reachability, bootstrap auth state, and the live runtime signals exposed by the existing local bridge implementation."
        eyebrow="Current state"
        title="Connection"
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="overflow-hidden bg-card/72 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardContent className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[0.68rem] tracking-[0.26em] text-primary uppercase">
                  Runtime status
                </span>
                <div className="h-px w-16 bg-linear-to-r from-primary/45 to-transparent" />
              </div>
              <div className="flex items-center gap-3">
                <h2 className="font-heading text-4xl tracking-[-0.06em] text-foreground">
                  {healthState.status === "ok"
                    ? "Connected"
                    : healthState.status === "error"
                      ? "Degraded"
                      : "Checking"}
                </h2>
                <Badge
                  className={
                    healthState.status === "ok"
                      ? "bg-primary/12 text-primary"
                      : healthState.status === "error"
                        ? "bg-destructive/12 text-destructive"
                        : "bg-secondary/16 text-secondary pulse-secondary"
                  }
                  variant="secondary"
                >
                  {healthState.status}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                The browser client stays bridge-first. This view reports only the runtime
                and HTTP health signals that exist today.
              </p>
            </div>

            <div className="rounded-[12px] border border-white/8 bg-background/48 px-4 py-2.5">
              <p className="font-mono text-[0.68rem] tracking-[0.24em] text-muted-foreground uppercase">
                Latest check
              </p>
              <p className="mt-2 font-mono text-sm text-foreground">
                {"checkedAt" in healthState && healthState.checkedAt
                  ? formatTimestamp(healthState.checkedAt)
                  : "Awaiting first probe"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardHeader>
            <CardTitle className="text-xl tracking-[-0.04em]">Mode snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 rounded-[12px] border border-white/8 bg-background/42 px-3 py-2.5">
              <StatusLine label="Mode" value={connectionModeLabel} />
              <StatusLine label="Endpoint" value={bridgeBaseUrl} />
              <StatusLine
                label="Auth"
                value={bridgeAccessToken ? "Bootstrap token present" : "Bootstrap token missing"}
              />
            </div>
          </CardContent>
        </Card>
      </section>

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
        <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardHeader className="border-b border-white/6 bg-background/35">
            <CardTitle className="text-xl tracking-[-0.04em]">Runtime snapshot</CardTitle>
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
          <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
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
                      ? "bg-primary/12 text-primary"
                      : healthState.status === "error"
                        ? "bg-destructive/12 text-destructive"
                        : "bg-secondary/16 text-secondary pulse-secondary"
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

        <Card className="overflow-hidden bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
        <CardHeader className="border-b border-white/6 bg-background/35">
          <CardTitle className="text-xl tracking-[-0.04em]">Diagnostic runtime feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {diagnosticFeed.map((entry) => (
            <div
              className="flex items-start gap-3 rounded-[12px] border border-white/8 bg-background/42 px-3 py-3"
              key={`${entry.label}-${entry.timestamp}`}
            >
              <div className="min-w-[3.25rem]">
                <p className="font-mono text-[0.68rem] text-muted-foreground">
                  {entry.timestamp}
                </p>
                <p className={entry.toneClass}>{entry.state}</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-foreground">
                    {entry.label}
                  </p>
                  {entry.badge ? (
                    <Badge className={entry.badgeClass} variant="secondary">
                      {entry.badge}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {entry.message}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function buildDiagnosticFeed({
  healthState,
  lastError,
  selectedThreadId,
  snapshot
}: {
  healthState: HealthState;
  lastError: string | null;
  selectedThreadId: string | null;
  snapshot: ReturnType<typeof useRuntimeSnapshot>;
}) {
  const timestamp =
    "checkedAt" in healthState && healthState.checkedAt
      ? formatTimestamp(healthState.checkedAt)
      : "Pending";

  return [
    {
      badge:
        healthState.status === "ok"
          ? "reachable"
          : healthState.status === "error"
            ? "unavailable"
            : "probing",
      badgeClass:
        healthState.status === "ok"
          ? "bg-primary/12 text-primary"
          : healthState.status === "error"
            ? "bg-destructive/12 text-destructive"
            : "bg-secondary/16 text-secondary pulse-secondary",
      label: "Bridge health",
      message:
        healthState.status === "checking"
          ? `Health probe for ${bridgeHealthUrl} is still in progress.`
          : healthState.status === "error"
          ? healthState.message
          : `Health endpoint ${bridgeHealthUrl} responded through the current local bridge route.`,
      state:
        healthState.status === "ok"
          ? "READY"
          : healthState.status === "error"
            ? "ERROR"
            : "CHECK",
      timestamp,
      toneClass:
        healthState.status === "ok"
          ? "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-primary"
          : healthState.status === "error"
            ? "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-destructive"
            : "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-secondary"
    },
    {
      badge: snapshot.threads.kind,
      badgeClass: "bg-background/70 text-muted-foreground",
      label: "Thread snapshot",
      message:
        snapshot.threads.kind === "ready"
          ? `Loaded ${snapshot.threads.threads.length} thread summaries from bridge authority.`
          : snapshot.threads.kind === "error"
            ? snapshot.threads.message
            : "Thread list is still being fetched from the bridge.",
      state:
        snapshot.threads.kind === "ready"
          ? "SYNCED"
          : snapshot.threads.kind === "error"
            ? "FAULT"
            : "LOAD",
      timestamp,
      toneClass:
        snapshot.threads.kind === "ready"
          ? "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-primary"
          : snapshot.threads.kind === "error"
            ? "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-destructive"
            : "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-secondary"
    },
    {
      badge: selectedThreadId ? "selected" : "idle",
      badgeClass: selectedThreadId
        ? "bg-primary/12 text-primary"
        : "bg-background/70 text-muted-foreground",
      label: "Focused thread",
      message: selectedThreadId
        ? `Runtime is tracking thread ${selectedThreadId}.`
        : "No thread is currently selected in the route shell.",
      state: selectedThreadId ? "FOCUS" : "IDLE",
      timestamp,
      toneClass: selectedThreadId
        ? "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-primary"
        : "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground"
    },
    {
      badge: lastError ? "attention" : "clear",
      badgeClass: lastError
        ? "bg-destructive/12 text-destructive"
        : "bg-primary/12 text-primary",
      label: "Mutation channel",
      message: lastError
        ? lastError
        : "No recent client mutation errors have been recorded.",
      state: lastError ? "WARN" : "CLEAR",
      timestamp,
      toneClass: lastError
        ? "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-destructive"
        : "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-primary"
    }
  ];
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
    <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
      <CardHeader className="gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary/12">
          {icon}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[0.68rem] tracking-[0.26em] text-muted-foreground uppercase">
            {title}
          </p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-[1.7rem] tracking-[-0.04em]">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-white/8 bg-background/50 px-3 py-2.5">
      <p className="font-mono text-[0.68rem] tracking-[0.24em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="shrink-0 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-all text-right font-mono text-sm text-foreground">
        {value}
      </span>
    </div>
  );
}
