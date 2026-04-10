import { Cable, Inbox, PanelsTopLeft, Sparkles } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { bridgeBaseUrl, connectionModeLabel } from "@/lib/env";
import { cn } from "@/lib/utils";

const navigationItems = [
  {
    icon: PanelsTopLeft,
    label: "Threads",
    to: "/threads"
  },
  {
    icon: Inbox,
    label: "Inbox",
    to: "/inbox"
  },
  {
    icon: Cable,
    label: "Connection",
    to: "/connection"
  }
];

function getMobileHeading(pathname: string) {
  if (pathname.startsWith("/connection")) {
    return "Connection";
  }

  if (pathname.startsWith("/inbox")) {
    return "Inbox";
  }

  if (pathname.startsWith("/threads/")) {
    return "Thread";
  }

  return "Threads";
}

export function AppShell() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] gap-6 px-4 py-4 md:px-6 lg:px-8">
        <aside className="hidden lg:block lg:w-[280px]">
          <div className="sticky top-6 flex h-[calc(100svh-3rem)] flex-col rounded-[32px] border border-border/70 bg-card/80 p-6 shadow-[0_30px_80px_rgba(65,46,23,0.10)] backdrop-blur">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-xs font-medium tracking-[0.24em] text-primary uppercase">
                <Sparkles className="size-3.5" />
                Local-first Codex
              </div>
              <div className="space-y-2">
                <h1 className="font-heading text-3xl leading-none tracking-tight text-foreground">
                  My Codex App
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Shared Web client for monitoring, steering, and approving Codex turns
                  away from the desktop.
                </p>
              </div>
            </div>

            <nav className="mt-8 grid gap-2">
              {navigationItems.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition hover:border-border/70 hover:bg-background/80 hover:text-foreground",
                      isActive &&
                        "border-primary/20 bg-primary/10 text-foreground shadow-[0_12px_24px_rgba(82,57,25,0.08)]"
                    )
                  }
                  key={item.to}
                  to={item.to}
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="size-4.5" />
                    {item.label}
                  </span>
                  <span className="text-xs uppercase opacity-70">
                    {item.label === "Threads" ? "Primary" : "View"}
                  </span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto space-y-4 rounded-[28px] border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                  Connection
                </span>
                <Badge className="bg-emerald-500/10 text-emerald-700" variant="secondary">
                  {connectionModeLabel}
                </Badge>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="truncate text-sm font-medium text-foreground">
                    {bridgeBaseUrl}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="right">{bridgeBaseUrl}</TooltipContent>
              </Tooltip>
              <p className="text-sm leading-6 text-muted-foreground">
                The bridge remains the only process that talks directly to Codex
                app-server.
              </p>
            </div>
          </div>
        </aside>

        <div className="min-h-screen min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
          <header className="sticky top-0 z-30 mb-4 rounded-[28px] border border-border/70 bg-card/75 px-4 py-3 shadow-[0_16px_40px_rgba(65,46,23,0.08)] backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.7rem] font-medium tracking-[0.24em] text-primary/80 uppercase">
                  My Codex App
                </p>
                <h2 className="font-heading text-xl tracking-tight">
                  {getMobileHeading(location.pathname)}
                </h2>
              </div>
              <Badge className="bg-primary/10 text-primary" variant="secondary">
                {connectionModeLabel}
              </Badge>
            </div>
          </header>

          <main className="space-y-6">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 rounded-[24px] border border-border/70 bg-card/90 p-2 shadow-[0_24px_56px_rgba(65,46,23,0.16)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-medium text-muted-foreground transition",
                  isActive && "bg-primary text-primary-foreground shadow-sm"
                )
              }
              key={item.to}
              to={item.to}
            >
              <item.icon className="size-4.5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
