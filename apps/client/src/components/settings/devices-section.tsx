import { useCallback, useEffect, useState } from "react";
import { LaptopMinimal, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBridgeClient, useRuntime } from "@/lib/runtime/runtime-provider";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { DeviceTrustRecord } from "@my-codex-app/protocol";

export function DevicesSection() {
  const { formatRelativeTime, t } = useI18n();
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
      toast.error(error instanceof Error ? error.message : t("devices.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [bridgeClient, t]);

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
      toast.success(t("devices.success.revoked"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("devices.error.revokeFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(deviceId: string) {
    if (credentials?.device.deviceId === deviceId) return;
    setLoading(true);
    try {
      await bridgeClient.deleteDevice({ deviceId });
      await refreshDevices();
      toast.success(t("devices.success.deleted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("devices.error.deleteFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        {t("settings.devices.title")}
      </h3>

      {!credentials ? (
        <p className="text-sm text-muted-foreground">{t("devices.empty.pairFirst")}</p>
      ) : devices.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">{t("devices.empty.none")}</p>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => {
            const isCurrent = device.deviceId === credentials?.device.deviceId;
            const isRevoked = device.revokedAt !== undefined;

            return (
              <div
                className="rounded-xl border border-subtle/8 bg-background/42 p-3"
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
                          {t("devices.badge.current")}
                        </Badge>
                      ) : null}
                      {isRevoked ? (
                        <Badge className="bg-destructive/12 text-destructive" variant="secondary">
                          {t("devices.badge.revoked")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="font-mono text-[0.7rem] text-muted-foreground">
                      {t("devices.lastSeen", { relative: formatRelativeTime(device.lastSeenAt) })}
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
                      {t("devices.action.revoke")}
                    </Button>
                  ) : (
                    <Button
                      disabled={loading}
                      onClick={() => {
                        void handleDelete(device.deviceId);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {t("devices.action.delete")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
