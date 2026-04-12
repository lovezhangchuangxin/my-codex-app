import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useRuntimeSnapshot } from "@/lib/runtime/use-runtime-snapshot";

export function NotificationBell({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  const snapshot = useRuntimeSnapshot();

  const pendingCount =
    snapshot.threads.kind === "ready"
      ? snapshot.threads.threads.reduce((sum, t) => sum + t.pendingRequests.length, 0)
      : 0;

  return (
    <Button
      aria-label={t("header.openRequests")}
      className="relative"
      onClick={onClick}
      size="icon-sm"
      variant="ghost"
    >
      <Bell className="size-4" />
      {pendingCount > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      ) : null}
    </Button>
  );
}
