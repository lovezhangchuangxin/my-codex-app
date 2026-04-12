import { type ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";

// "disconnected" and "reconnecting" have credentials but disrupted transport —
// allow access to workspace so users see a reconnect banner instead of being
// booted to pairing. "revoked" and "expired" are terminal states that require
// re-pairing, so they redirect to /pair.
const authenticatedStates = new Set(["authenticated", "refreshing", "resyncing", "disconnected", "reconnecting"]);

export function AuthGuard({ children }: { children: ReactNode }) {
  const snapshot = useRuntimeSnapshot();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = authenticatedStates.has(snapshot.connection.kind);

  useEffect(() => {
    if (!isAuthenticated && !location.pathname.startsWith("/pair")) {
      navigate("/pair", { replace: true });
    }
    if (isAuthenticated && location.pathname.startsWith("/pair")) {
      navigate("/threads", { replace: true });
    }
  }, [isAuthenticated, location.pathname, navigate]);

  return <>{children}</>;
}
