import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ThreadStatusFilter } from "@/features/threads/lib/thread-utils";
import { useI18n } from "@/lib/i18n/use-i18n";

export function ThreadStatusTabs({
  value,
  onChange
}: {
  value: ThreadStatusFilter;
  onChange: (value: ThreadStatusFilter) => void;
}) {
  const { t } = useI18n();
  const statusFilters: Array<{ label: string; value: ThreadStatusFilter }> = [
    { label: t("thread.filter.all"), value: "all" },
    { label: t("thread.filter.active"), value: "active" },
    { label: t("thread.filter.waitingApproval"), value: "waitingApproval" },
    { label: t("thread.filter.idle"), value: "idle" }
  ];

  return (
    <Tabs
      className="min-w-0"
      onValueChange={(v) => {
        onChange(v as ThreadStatusFilter);
      }}
      value={value}
    >
      <div className="max-w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList
          className="h-auto min-w-max max-w-none flex-nowrap justify-start gap-1 rounded-xl bg-background/35 p-1"
          variant="line"
        >
          {statusFilters.map((filter) => (
            <TabsTrigger
              className="flex-none rounded-lg border-0 px-2.5 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground transition-all duration-150 data-active:bg-accent data-active:text-primary sm:px-3"
              key={filter.value}
              value={filter.value}
            >
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
