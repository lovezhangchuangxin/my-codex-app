import { useCallback, useEffect, useState } from "react";
import { Activity, KeyRound, LaptopMinimal, RefreshCcw, Shield, Smartphone } from "lucide-react";
import { toast } from "sonner";

import type { DeviceTrustRecord, PairingStatusResponse } from "@my-codex-app/protocol";

import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bridgeBaseUrl, bridgeHealthUrl, connectionModeLabel } from "@/lib/env";
import {
  createDefaultDeviceDraft
} from "@/lib/runtime/bridge-credential-store";
import { useBridgeClient, useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";
import { formatTimestamp } from "@/features/threads/lib/thread-utils";

type HealthState =
  | { checkedAt?: number; status: "checking" }
  | { checkedAt: number; status: "ok" }
  | { checkedAt: number; message: string; status: "error" };

type DeviceDraft = ReturnType<typeof createDefaultDeviceDraft>;

export function ConnectionRoute() {
  const bridgeClient = useBridgeClient();
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const [healthState, setHealthState] = useState<HealthState>({ status: "checking" });
  const [pairingStatus, setPairingStatus] = useState<PairingStatusResponse | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingPending, setPairingPending] = useState(false);
  const [sessionPending, setSessionPending] = useState(false);
  const [devicesPending, setDevicesPending] = useState(false);
  const [devices, setDevices] = useState<DeviceTrustRecord[]>([]);
  const [deviceDraft, setDeviceDraft] = useState<DeviceDraft>(() => createDefaultDeviceDraft());
  const [credentialsVersion, setCredentialsVersion] = useState(0);

  const credentials = bridgeClient.getCredentials();

  const refreshView = useCallback(async () => {
    try {
      const nextPairingStatus = await bridgeClient.getPairingStatus();
      setPairingStatus(nextPairingStatus);
    } catch (error) {
      toast.error(toErrorMessage(error));
    }

    if (!bridgeClient.hasCredentials()) {
      setDevices([]);
      setCredentialsVersion((current) => current + 1);
      return;
    }

    setDevicesPending(true);
    try {
      const response = await bridgeClient.listDevices();
      setDevices(response.devices);
      setCredentialsVersion((current) => current + 1);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setDevicesPending(false);
    }
  }, [bridgeClient]);

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
        message: toErrorMessage(error),
        status: "error"
      });
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    void refreshView();

    const intervalId = window.setInterval(() => {
      void checkHealth();
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [checkHealth, refreshView]);

  async function handlePairDevice() {
    setPairingPending(true);
    try {
      await bridgeClient.completePairing({
        code: pairingCode,
        device: deviceDraft
      });
      setPairingCode("");
      await runtime.loadThreads();
      await refreshView();
      toast.success("Device paired");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setPairingPending(false);
    }
  }

  async function handleRefreshSession() {
    setSessionPending(true);
    try {
      await bridgeClient.refreshSession();
      await refreshView();
      toast.success("Session refreshed");
    } catch (error) {
      if (!bridgeClient.hasCredentials()) {
        runtime.resetState();
      }
      await refreshView();
      toast.error(toErrorMessage(error));
    } finally {
      setSessionPending(false);
    }
  }

  async function handleRevokeDevice(deviceId: string) {
    setDevicesPending(true);
    try {
      await bridgeClient.revokeDevice({ deviceId });
      if (credentials?.device.deviceId === deviceId) {
        bridgeClient.clearCredentials();
        runtime.resetState();
      }
      await refreshView();
      toast.success("Device revoked");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setDevicesPending(false);
    }
  }

  function handleDisconnectLocal() {
    bridgeClient.clearCredentials();
    runtime.resetState();
    setDeviceDraft(createDefaultDeviceDraft());
    void refreshView();
  }

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
                void refreshView();
              }}
              variant="outline"
            >
              <RefreshCcw className="size-4" />
              Refresh auth
            </Button>
          </div>
        }
        description="Pair this browser explicitly, inspect trusted devices, and keep the bridge session healthy without relying on a shared bootstrap token."
        eyebrow="Local auth"
        title="Connection"
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="bg-card/72 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Shield className="size-5 text-primary" />
              Bridge session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatusRow label="Mode" value={connectionModeLabel} />
              <StatusRow label="Endpoint" value={bridgeBaseUrl} />
              <StatusRow
                label="Health"
                value={healthState.status === "ok" ? "Reachable" : healthState.status}
              />
              <StatusRow
                label="Auth"
                value={credentials ? "Paired session active" : "Pairing required"}
              />
            </div>

            {credentials ? (
              <div className="rounded-[14px] border border-white/8 bg-background/42 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{credentials.device.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {credentials.device.platform} · access expires{" "}
                      {formatTimestamp(credentials.accessTokenExpiresAt)}
                    </p>
                  </div>
                  <Badge className="bg-primary/12 text-primary" variant="secondary">
                    Authenticated
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={sessionPending}
                    onClick={() => {
                      void handleRefreshSession();
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Refresh session
                  </Button>
                  <Button
                    onClick={handleDisconnectLocal}
                    size="sm"
                    variant="outline"
                  >
                    Clear local credentials
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-white/8 bg-background/42 p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Pairing uses a short-lived code shown in the bridge terminal. Enter that code
                  below to create a revocable trusted device record for this browser.
                </p>
              </div>
            )}

            {healthState.status === "error" ? (
              <Alert className="border-destructive/20 bg-destructive/5">
                <AlertTitle>Bridge health failed</AlertTitle>
                <AlertDescription>{healthState.message}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardHeader>
            <CardTitle className="text-xl tracking-[-0.04em]">Runtime snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 rounded-[12px] border border-white/8 bg-background/42 px-3 py-3">
            <StatusRow label="Thread list" value={snapshot.threads.kind} />
            <StatusRow label="Detail state" value={snapshot.detail.kind} />
            <StatusRow label="Selected thread" value={snapshot.selectedThreadId ?? "None"} />
            <StatusRow
              label="Pending responses"
              value={String(snapshot.mutations.respondingRequestIds.length)}
            />
            <StatusRow
              label="Last check"
              value={
                "checkedAt" in healthState && healthState.checkedAt
                  ? formatTimestamp(healthState.checkedAt)
                  : "Awaiting first probe"
              }
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <KeyRound className="size-5 text-primary" />
              Pair this browser
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pairingStatus ? (
              <Alert className="border-primary/15 bg-primary/5">
                <AlertTitle>Pairing challenge active</AlertTitle>
                <AlertDescription>
                  {pairingStatus.instructions} Code expires{" "}
                  {formatTimestamp(pairingStatus.expiresAt)}.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Pairing code"
                onChange={setPairingCode}
                placeholder="Enter code from bridge terminal"
                value={pairingCode}
              />
              <Field
                label="Device label"
                onChange={(value) => {
                  setDeviceDraft((current) => ({ ...current, label: value }));
                }}
                placeholder="Browser"
                value={deviceDraft.label}
              />
              <Field
                label="Platform"
                onChange={(value) => {
                  setDeviceDraft((current) => ({ ...current, platform: value }));
                }}
                placeholder="browser"
                value={deviceDraft.platform}
              />
              <Field
                label="Device id"
                onChange={(value) => {
                  setDeviceDraft((current) => ({ ...current, deviceId: value }));
                }}
                value={deviceDraft.deviceId}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pairingPending || pairingCode.trim().length === 0}
                onClick={() => {
                  void handlePairDevice();
                }}
              >
                Pair device
              </Button>
              <Button
                onClick={() => {
                  setDeviceDraft(createDefaultDeviceDraft());
                }}
                variant="outline"
              >
                Regenerate draft device
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardHeader>
            <CardTitle className="text-xl">Trusted devices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!credentials ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Pair first to inspect and revoke trusted devices.
              </p>
            ) : null}

            {credentials && devices.length === 0 && !devicesPending ? (
              <p className="text-sm leading-6 text-muted-foreground">No trusted devices found.</p>
            ) : null}

            {devices.map((device) => {
              const isCurrent = device.deviceId === credentials?.device.deviceId;
              const isRevoked = device.revokedAt !== undefined;
              return (
                <div
                  className="rounded-[12px] border border-white/8 bg-background/42 p-3"
                  key={`${device.deviceId}-${credentialsVersion}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {device.platform.toLowerCase().includes("iphone") ||
                        device.platform.toLowerCase().includes("android") ? (
                          <Smartphone className="size-4 text-primary" />
                        ) : (
                          <LaptopMinimal className="size-4 text-primary" />
                        )}
                        <p className="font-medium text-foreground">{device.label}</p>
                        {isCurrent ? (
                          <Badge className="bg-primary/12 text-primary" variant="secondary">
                            Current
                          </Badge>
                        ) : null}
                        {isRevoked ? (
                          <Badge className="bg-destructive/12 text-destructive" variant="secondary">
                            Revoked
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{device.platform}</p>
                      <p className="font-mono text-[0.68rem] text-muted-foreground">
                        Last seen {formatTimestamp(device.lastSeenAt)}
                      </p>
                    </div>

                    {!isRevoked ? (
                      <Button
                        disabled={devicesPending}
                        onClick={() => {
                          void handleRevokeDevice(device.deviceId);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({
  label,
  onChange,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown bridge error";
}
