import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] bg-card/65 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-7",
        className
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl space-y-3">
          {eyebrow ? (
            <div className="flex items-center gap-3">
              <p className="font-mono text-[0.68rem] tracking-[0.28em] text-primary/90 uppercase">
                {eyebrow}
              </p>
              <div className="h-px w-14 bg-linear-to-r from-primary/45 to-transparent" />
            </div>
          ) : null}
          <div className="space-y-2">
            <h1 className="font-heading text-3xl leading-none tracking-[-0.04em] text-foreground md:text-5xl">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              {description}
            </p>
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
