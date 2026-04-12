import { useCallback, useEffect, useState } from "react";
import { LaptopMinimal, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBridgeClient, useRuntime } from "@/lib/runtime/runtime-provider";
import { formatRelativeTime } from "@/features/threads/lib/thread-utils";
import type { DeviceTrustRecord } from "@my-codex-app/protocol";

export function DevicesSection() {
  const bridgeClient = useBridgeClient();
  const runtime = useRuntime();
  const credentials = bridgeClient.getCredentials();
  const [devices, setDevices] = useState<DeviceTrustRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshDevices = useCallback(async () => {
    if (!bridgeClient.hasCredentials()) {
      setDevices([]);
      return;
    }

    setLoading(true);
    try {
      const response = await bridgeClient.listDevices();
      setDevices(response.devices);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [bridgeClient]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  async function handleRevoke(deviceId: string) {
    setLoading(true);
    try {
      await bridgeClient.revokeDevice({ deviceId });
      if (credentials?.device.deviceId === deviceId) {
        bridgeClient.clearCredentials();
        runtime.resetState();
      }
      await refreshDevices();
      toast.success("Device revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke device");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        Trusted devices
      </h3>

      {!credentials ? (
        <p className="text-sm text-muted-foreground">Pair first to manage trusted devices.</p>
      ) : devices.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">No trusted devices found.</p>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => {
            const isCurrent = device.deviceId === credentials?.device.deviceId;
            const isRevoked = device.revokedAt !== undefined;

            return (
              <div
                className="rounded-xl border border-white/8 bg-background/42 p-3"
                key={device.deviceId}
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
                      <span className="text-sm font-medium text-foreground">{device.label}</span>
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
                    <p className="font-mono text-[0.7rem] text-muted-foreground">
                      Last seen {formatRelativeTime(device.lastSeenAt)}
                    </p>
                  </div>

                  {!isRevoked ? (
                    <Button
                      disabled={loading}
                      onClick={() => {
                        void handleRevoke(device.deviceId);
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
        </div>
      )}
    </div>
  );
}
