import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    async (event: { preventDefault: () => void }) => {
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
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-8 lg:min-h-[calc(100dvh-60px)]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center space-y-1.5 text-center">
          <div className="flex size-10 items-center justify-center rounded-full border bg-muted">
            <KeyRound className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Pair your device
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the pairing code from your bridge terminal
          </p>
        </div>

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <Input
            autoFocus
            disabled={isSubmitting}
            id="pairing-code"
            onChange={(event) => {
              setPairingCode(event.target.value);
            }}
            placeholder="e.g. ABCD-1234"
            value={pairingCode}
          />

          <p className="text-[13px] text-muted-foreground">
            Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              pnpm dev:bridge
            </code>{" "}
            in your terminal to get a code.
          </p>

          {pairingState.status === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>{pairingState.message}</AlertDescription>
            </Alert>
          ) : null}

          {bridgeAvailability.status === "unreachable" && pairingState.status === "idle" ? (
            <Alert>
              <AlertDescription>
                Bridge not detected. Make sure{" "}
                <code className="font-mono text-xs">pnpm dev:bridge</code>{" "}
                is running on your computer.
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            className="w-full bg-foreground text-background hover:bg-foreground/90"
            disabled={isSubmitting || pairingCode.trim().length === 0}
            size="lg"
            type="submit"
          >
            {isSubmitting ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </div>
    </div>
  );
}
