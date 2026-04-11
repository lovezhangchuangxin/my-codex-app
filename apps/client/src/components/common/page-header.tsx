import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  titleClassName
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[22px] border-b border-white/6 bg-card/65 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl md:p-5",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 max-w-3xl flex-1 space-y-2">
          {eyebrow ? (
            <div className="flex min-w-0 items-center gap-3">
              <p className="min-w-0 truncate font-mono text-[0.7rem] tracking-[0.18em] text-primary/90 uppercase">
                {eyebrow}
              </p>
              <div className="h-px w-14 shrink-0 bg-linear-to-r from-primary/45 to-transparent" />
            </div>
          ) : null}
          <div className="min-w-0 space-y-1">
            <h1
              className={cn(
                "min-w-0 max-w-full font-heading text-3xl leading-none tracking-[-0.04em] text-foreground md:text-4xl",
                titleClassName
              )}
            >
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-[0.925rem]">
              {description}
            </p>
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
