import { startTransition, useEffect } from "react";
import { PenSquare } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ThreadDetailPanel } from "@/features/threads/components/thread-detail-panel";
import { ThreadListPanel } from "@/features/threads/components/thread-list-panel";
import { useMobilePanel } from "@/hooks/use-mobile-panel";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";
import type { ThreadDetailState } from "@my-codex-app/sdk";
import type { LocalConnectionState } from "@my-codex-app/protocol";

export function ThreadsLayout() {
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const navigate = useNavigate();
  const location = useLocation();
  const { threadId } = useParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const mobilePanel = useMobilePanel();

  const routeThreadId = threadId ?? null;
  const highlightedRequestKey = new URLSearchParams(location.search).get("request");

  // Desktop: use URL param. Mobile: use panel state machine.
  const activeThreadId = isDesktop ? routeThreadId : mobilePanel.selectedThreadId;

  const displayedDetailState: ThreadDetailState =
    activeThreadId === null
      ? { kind: "idle" }
      : snapshot.selectedThreadId === activeThreadId
        ? snapshot.detail
        : unresolvedRouteDetailState(activeThreadId, snapshot.connection);

  useEffect(() => {
    void runtime.selectThread(isDesktop ? routeThreadId : mobilePanel.selectedThreadId);
  }, [runtime, isDesktop, routeThreadId, mobilePanel.selectedThreadId]);

  // Sync mobile panel with URL on initial load
  useEffect(() => {
    if (!isDesktop && routeThreadId && mobilePanel.view === "thread-list") {
      mobilePanel.openThread(routeThreadId);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreateThread() {
    void (async () => {
      try {
        const nextThreadId = await runtime.startThread();
        startTransition(() => {
          if (isDesktop) {
            navigate(`/threads/${encodeURIComponent(nextThreadId)}`);
          } else {
            mobilePanel.openThread(nextThreadId);
          }
        });
      } catch (error) {
        toast.error(toErrorMessage(error));
      }
    })();
  }

  function handleOpenThread(nextThreadId: string) {
    if (isDesktop) {
      startTransition(() => {
        navigate(`/threads/${encodeURIComponent(nextThreadId)}`);
      });
    } else {
      mobilePanel.openThread(nextThreadId);
    }
  }

  async function handleSendMessage(activeId: string, text: string) {
    try {
      await runtime.sendMessage(activeId, text);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error));
      return false;
    }
  }

  async function handleInterrupt(activeId: string, turnId: string) {
    try {
      await runtime.interruptTurn(activeId, turnId);
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  }

  async function handleRespond(request: Parameters<typeof runtime.respondToRequest>[0]) {
    try {
      await runtime.respondToRequest(request);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error));
      return false;
    }
  }

  // Mobile: full-screen panel switching
  if (!isDesktop) {
    if (mobilePanel.view === "thread-detail" && mobilePanel.selectedThreadId) {
      return (
        <div className="h-full">
          <ThreadDetailPanel
          connectionState={snapshot.connection}
          detailState={displayedDetailState}
          highlightedRequestKey={highlightedRequestKey}
          interruptPending={snapshot.mutations.interruptPending}
          isDesktop={false}
          lastError={snapshot.mutations.lastError}
          onBack={mobilePanel.backToList}
          onOpenThread={handleOpenThread}
          onRespondToRequest={handleRespond}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          respondingRequestIds={snapshot.mutations.respondingRequestIds}
          selectedThreadId={mobilePanel.selectedThreadId}
          sendMessagePending={snapshot.mutations.sendMessagePending}
          threadsState={snapshot.threads}
        />
        </div>
      );
    }

    return (
      <div className="relative">
        <ThreadListPanel
          connectionState={snapshot.connection}
          onOpenThread={handleOpenThread}
          selectedThreadId={null}
          threadsState={snapshot.threads}
        />
        <Button
          className="fixed right-4 bottom-6 z-20 size-12 rounded-full shadow-lg"
          disabled={
            snapshot.mutations.startThreadPending ||
            snapshot.connection.kind !== "authenticated"
          }
          onClick={handleCreateThread}
          size="icon"
        >
          <PenSquare className="size-5" />
        </Button>
      </div>
    );
  }

  // Desktop: side-by-side panels
  return (
    <div className="flex h-full">
      <div className="w-[280px] shrink-0 overflow-hidden border-r border-white/6">
        <ThreadListPanel
          connectionState={snapshot.connection}
          onOpenThread={handleOpenThread}
          selectedThreadId={routeThreadId}
          threadsState={snapshot.threads}
        />
      </div>
      <div className="min-w-0 flex-1">
        <ThreadDetailPanel
          connectionState={snapshot.connection}
          detailState={displayedDetailState}
          highlightedRequestKey={highlightedRequestKey}
          interruptPending={snapshot.mutations.interruptPending}
          isDesktop
          lastError={snapshot.mutations.lastError}
          onBack={() => {
            startTransition(() => {
              navigate("/threads");
            });
          }}
          onOpenThread={handleOpenThread}
          onRespondToRequest={handleRespond}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          respondingRequestIds={snapshot.mutations.respondingRequestIds}
          selectedThreadId={routeThreadId}
          sendMessagePending={snapshot.mutations.sendMessagePending}
          threadsState={snapshot.threads}
        />
      </div>
    </div>
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown client error";
}

function unresolvedRouteDetailState(
  threadId: string,
  connectionState: LocalConnectionState
): ThreadDetailState {
  switch (connectionState.kind) {
    case "unpaired":
      return {
        kind: "error",
        threadId,
        message: "Pair this browser before loading thread detail."
      };
    case "revoked":
      return {
        kind: "error",
        threadId,
        message: connectionState.message ?? "This trusted device was revoked."
      };
    case "expired":
      return {
        kind: "error",
        threadId,
        message: connectionState.message ?? "The bridge session expired."
      };
    case "disconnected":
      return {
        kind: "error",
        threadId,
        message: connectionState.message ?? "Bridge is disconnected."
      };
    default:
      return { kind: "loading", threadId };
  }
}
