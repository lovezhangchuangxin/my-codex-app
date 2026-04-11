import { startTransition, useEffect } from "react";
import { PenSquare } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ThreadDetailPanel } from "@/features/threads/components/thread-detail-panel";
import { ThreadListPanel } from "@/features/threads/components/thread-list-panel";
import { buildThreadTitle } from "@/features/threads/lib/thread-utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";
import type { ThreadDetailState } from "@my-codex-app/sdk";

export function ThreadsShell() {
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const navigate = useNavigate();
  const location = useLocation();
  const { threadId } = useParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const highlightedRequestKey = new URLSearchParams(location.search).get("request");
  const routeThreadId = threadId ?? null;
  const displayedDetailState: ThreadDetailState =
    routeThreadId === null
      ? { kind: "idle" }
      : snapshot.selectedThreadId === routeThreadId
        ? snapshot.detail
        : { kind: "loading", threadId: routeThreadId };

  useEffect(() => {
    void runtime.selectThread(routeThreadId);
  }, [runtime, routeThreadId]);

  async function handleCreateThread() {
    try {
      const nextThreadId = await runtime.startThread();
      startTransition(() => {
        navigate(`/threads/${encodeURIComponent(nextThreadId)}`);
      });
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  }

  function handleOpenThread(nextThreadId: string, requestKey?: string) {
    startTransition(() => {
      navigate({
        pathname: `/threads/${encodeURIComponent(nextThreadId)}`,
        ...(requestKey ? { search: `?request=${encodeURIComponent(requestKey)}` } : {})
      });
    });
  }

  async function handleSendMessage(activeThreadId: string, text: string) {
    try {
      await runtime.sendMessage(activeThreadId, text);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error));
      return false;
    }
  }

  async function handleInterrupt(activeThreadId: string, activeTurnId: string) {
    try {
      await runtime.interruptTurn(activeThreadId, activeTurnId);
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

  if (!isDesktop && routeThreadId) {
    return (
      <ThreadDetailPanel
        detailState={displayedDetailState}
        highlightedRequestKey={highlightedRequestKey}
        interruptPending={snapshot.mutations.interruptPending}
        isDesktop={false}
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
    );
  }

  const detailTitle =
    displayedDetailState.kind === "ready"
      ? buildThreadTitle(displayedDetailState.thread)
      : routeThreadId
        ? "Loading thread"
        : "Thread detail";

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Button
            disabled={snapshot.mutations.startThreadPending}
            onClick={() => {
              void handleCreateThread();
            }}
          >
            <PenSquare className="size-4" />
            {snapshot.mutations.startThreadPending ? "Creating..." : "New thread"}
          </Button>
        }
        description="Scan active work fast, filter by signal, and drop into the exact thread that needs steering or approval."
        eyebrow="Active neural sessions"
        title={isDesktop ? "Threads" : "Thread monitor"}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <ThreadListPanel
          onOpenThread={handleOpenThread}
          selectedThreadId={routeThreadId}
          threadsState={snapshot.threads}
        />

        <div className="hidden lg:block">
          <PageHeader
            className="mb-3"
            description="Open a thread to inspect turns, stream output, resolve prompts, and keep control of the current run."
            eyebrow="Thread detail"
            title={detailTitle}
          />
          <ThreadDetailPanel
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
    </div>
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown client error";
}
