import type { ThreadSummary } from "@my-codex-app/protocol";

import { ThreadCard } from "@/components/threads/thread-card";
import { useI18n } from "@/lib/i18n/use-i18n";

export function WorkspaceGroup({
  isSelected,
  onOpen,
  threads,
  workspace
}: {
  isSelected: (id: string) => boolean;
  onOpen: (threadId: string) => void;
  threads: ThreadSummary[];
  workspace: string;
}) {
  const { t } = useI18n();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">
            <span className="font-mono text-xs text-primary/70">~/</span>
            <div className="h-px flex-1 bg-linear-to-r from-white/10 to-transparent" />
          </div>
          <h3 className="truncate font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            {workspace}
          </h3>
          <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground uppercase">
            {t("thread.list.workspaceCount", { count: threads.length })}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {threads.map((thread) => (
          <ThreadCard
            isSelected={isSelected(thread.id)}
            key={thread.id}
            onOpen={onOpen}
            thread={thread}
          />
        ))}
      </div>
    </section>
  );
}
