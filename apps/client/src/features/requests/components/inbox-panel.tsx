import { startTransition } from "react";
import { Inbox, RefreshCcw, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingRequestList } from "@/features/requests/components/pending-request-list";
import {
  buildPendingRequestEntries,
  toRequestKey
} from "@/features/requests/lib/request-utils";
import { useRequestDrafts } from "@/features/requests/lib/use-request-drafts";
import { useRuntime } from "@/lib/runtime/runtime-provider";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";

export function InboxPanel() {
  const runtime = useRuntime();
  const snapshot = useRuntimeSnapshot();
  const navigate = useNavigate();
  const drafts = useRequestDrafts();

  const entries =
    snapshot.threads.kind === "ready"
      ? buildPendingRequestEntries(snapshot.threads.threads)
      : [];

  const counts = entries.reduce(
    (current, entry) => {
      current[entry.request.kind] += 1;
      return current;
    },
    {
      command: 0,
      fileChange: 0,
      permissions: 0,
      userInput: 0
    }
  );

  async function handleRespond(request: Parameters<typeof runtime.respondToRequest>[0]) {
    try {
      await runtime.respondToRequest(request);
      drafts.clearRequest(request.requestId);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error));
      return false;
    }
  }

  function handleOpenThread(threadId: string, requestKey?: string) {
    startTransition(() => {
      navigate({
        pathname: `/threads/${encodeURIComponent(threadId)}`,
        ...(requestKey ? { search: `?request=${encodeURIComponent(requestKey)}` } : {})
      });
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              void runtime.loadThreads();
            }}
            variant="outline"
          >
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
        }
        description="Resolve approvals and user-input prompts across workspaces without digging through each thread one by one."
        eyebrow="Pending actions"
        title="Inbox"
      />

      {snapshot.threads.kind === "ready" ? (
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
            {entries.length} pending total
          </Badge>
          <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
            {counts.command} command
          </Badge>
          <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
            {counts.fileChange} file change
          </Badge>
          <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
            {counts.permissions} permissions
          </Badge>
          <Badge className="bg-background/55 font-mono text-[0.68rem] uppercase text-muted-foreground" variant="secondary">
            {counts.userInput} input
          </Badge>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <CardHeader className="gap-2 border-b border-white/6 bg-background/35">
            <p className="font-mono text-[0.68rem] tracking-[0.26em] text-secondary uppercase">
              Review queue
            </p>
            <CardTitle className="text-xl tracking-[-0.04em]">Pending work</CardTitle>
            <p className="text-sm text-muted-foreground">
              Requests stay here until the bridge resolves them or the thread state changes.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {snapshot.threads.kind === "loading" ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="rounded-[24px] bg-accent/72 p-4" key={index}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-28 rounded-full bg-background/55" />
                        <div className="h-6 w-20 rounded-full bg-background/40" />
                      </div>
                      <div className="h-5 w-4/5 rounded-full bg-background/50" />
                      <div className="h-4 w-full rounded-full bg-background/35" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {snapshot.threads.kind === "error" ? (
              <Card className="bg-destructive/6">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium text-destructive">Unable to build inbox</p>
                  <p className="text-sm text-muted-foreground">{snapshot.threads.message}</p>
                </CardContent>
              </Card>
            ) : null}

            {snapshot.threads.kind === "ready" && entries.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-6 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <ShieldCheck className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-heading text-2xl tracking-[-0.04em]">Inbox is clear</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      New command approvals, patch requests, permission prompts, and
                      structured questions will surface here.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {snapshot.threads.kind === "ready" && entries.length > 0 ? (
              <PendingRequestList
                entries={entries}
                getDraft={drafts.getDraft}
                highlightedRequestKey={null}
                onOpenThread={handleOpenThread}
                onRespondToRequest={handleRespond}
                respondingRequestIds={snapshot.mutations.respondingRequestIds}
                setDraft={drafts.setDraft}
                showThreadContext
              />
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Inbox className="size-5 text-primary" />
                Queue summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryRow label="Command approvals" value={counts.command} />
              <SummaryRow label="File changes" value={counts.fileChange} />
              <SummaryRow label="Permission requests" value={counts.permissions} />
              <SummaryRow label="User input prompts" value={counts.userInput} />
            </CardContent>
          </Card>

          <Card className="bg-card/68 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
            <CardHeader>
              <CardTitle className="text-xl">How to use this view</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>Open the related thread when you need more context around a request.</p>
              <p>
                For structured user input, you can answer directly here or jump into the
                thread and keep reading the timeline.
              </p>
              <p>
                The bridge remains authoritative, so resolved requests disappear as soon as
                live state catches up.
              </p>
              {entries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {entries.slice(0, 3).map((entry) => (
                    <Badge className="border-0 bg-background/70 font-mono text-[0.68rem] uppercase text-muted-foreground" key={toRequestKey(entry.request.requestId)} variant="outline">
                      {(entry.thread.name ?? entry.thread.preview) || entry.thread.id}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-background/55 px-4 py-3">
      <span className="font-mono text-[0.72rem] uppercase text-muted-foreground">{label}</span>
      <span className="font-heading text-xl tracking-[-0.04em] text-foreground">{value}</span>
    </div>
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown client error";
}
