import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bridgeHealthUrl } from "@/lib/env";
import { useBridgeClient, useRuntime } from "@/lib/runtime/runtime-provider";

import { detectDeviceInfo } from "./device-info";

type PairingState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { message: string; status: "error" };

type BridgeAvailability =
  | { status: "unknown" }
  | { status: "reachable" }
  | { status: "unreachable" };

export function PairingScreen() {
  const bridgeClient = useBridgeClient();
  const runtime = useRuntime();
  const navigate = useNavigate();

  const [pairingCode, setPairingCode] = useState("");
  const [pairingState, setPairingState] = useState<PairingState>({ status: "idle" });
  const [bridgeAvailability, setBridgeAvailability] = useState<BridgeAvailability>({
    status: "unknown"
  });

  useEffect(() => {
    let cancelled = false;

    async function checkBridge() {
      try {
        const response = await fetch(bridgeHealthUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error("not ok");
        if (!cancelled) setBridgeAvailability({ status: "reachable" });
      } catch {
        if (!cancelled) setBridgeAvailability({ status: "unreachable" });
      }
    }

    void checkBridge();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const code = pairingCode.trim();
      if (code.length === 0) return;

      setPairingState({ status: "submitting" });

      try {
        const device = detectDeviceInfo();
        await bridgeClient.completePairing({ code, device });
        setPairingState({ status: "success" });
        await runtime.bootstrap();
        navigate("/threads", { replace: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Pairing failed. Please try again.";
        setPairingState({ status: "error", message });
      }
    },
    [bridgeClient, runtime, navigate, pairingCode]
  );

  const isSubmitting = pairingState.status === "submitting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center gap-2 rounded-full bg-primary/12 px-3 py-1.5 font-mono text-[0.7rem] tracking-[0.18em] text-primary uppercase">
            <Sparkles className="size-3.5" />
            Codex
          </div>
          <p className="text-sm text-muted-foreground">
            Access your Codex sessions from any device
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="pairing-code">Pairing code</Label>
            <Input
              disabled={isSubmitting}
              id="pairing-code"
              onChange={(event) => {
                setPairingCode(event.target.value);
              }}
              placeholder="Enter code from bridge terminal"
              value={pairingCode}
            />
            <p className="text-sm text-muted-foreground">
              Run <code className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">pnpm dev:bridge</code> in your terminal and check the displayed pairing code.
            </p>
          </div>

          {pairingState.status === "error" ? (
            <p className="text-sm text-destructive">{pairingState.message}</p>
          ) : null}

          {bridgeAvailability.status === "unreachable" && pairingState.status === "idle" ? (
            <p className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-sm text-primary">
              Bridge not detected. Make sure <code className="font-mono text-xs">pnpm dev:bridge</code> is running on your computer.
            </p>
          ) : null}

          <Button className="w-full" disabled={isSubmitting || pairingCode.trim().length === 0} type="submit">
            {isSubmitting ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </div>
    </div>
  );
}
