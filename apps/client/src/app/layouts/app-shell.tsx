import { Cable, Inbox, PanelsTopLeft, Sparkles } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1520px] gap-6 px-4 py-4 md:px-6 lg:px-8">
        <aside className="hidden lg:block lg:w-[296px]">
          <div className="sticky top-6 flex h-[calc(100svh-3rem)] flex-col overflow-hidden rounded-[30px] bg-card/55 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div className="border-b border-white/6 px-6 pt-6 pb-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 font-mono text-[0.65rem] tracking-[0.26em] text-primary uppercase">
                <Sparkles className="size-3.5" />
                Engine Terminal
              </div>
              <div className="mt-5 space-y-2">
                <h1 className="font-heading text-3xl leading-none tracking-[-0.06em] text-foreground">
                  My Codex App
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Shared client for monitoring turns, resolving approvals, and staying in
                  sync with the local bridge.
                </p>
              </div>
            </div>

            <nav className="grid gap-2 px-4 pt-5">
              {navigationItems.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-accent/60 hover:text-foreground",
                      isActive &&
                        "bg-accent text-foreground shadow-[inset_0_0_0_1px_rgba(78,222,163,0.18)]"
                    )
                  }
                  key={item.to}
                  to={item.to}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-2xl bg-background/60 text-muted-foreground transition",
                        location.pathname.startsWith(item.to) && "bg-primary/14 text-primary"
                      )}
                    >
                      <item.icon className="size-4.5" />
                    </span>
                    {item.label}
                  </span>
                  <span className="font-mono text-[0.68rem] uppercase opacity-70">
                    {item.label === "Threads" ? "Primary" : "View"}
                  </span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto space-y-4 border-t border-white/6 bg-background/30 px-6 py-5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.68rem] tracking-[0.26em] text-muted-foreground uppercase">
                  Connection
                </span>
                <Badge className="bg-primary/12 text-primary" variant="secondary">
                  {connectionModeLabel}
                </Badge>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="truncate font-mono text-sm text-foreground">
                    {bridgeBaseUrl}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="right">{bridgeBaseUrl}</TooltipContent>
              </Tooltip>
              <p className="text-sm leading-6 text-muted-foreground">
                The bridge remains the only process that talks directly to Codex
                app-server.
              </p>
              <Button asChild className="w-full justify-between" variant="ghost">
                <NavLink to="/connection">
                  Review diagnostics
                  <Cable className="size-4" />
                </NavLink>
              </Button>
            </div>
          </div>
        </aside>

        <div className="min-h-screen min-w-0 flex-1 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <header className="sticky top-0 z-30 mb-4 rounded-[26px] bg-card/70 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[0.68rem] tracking-[0.26em] text-primary/80 uppercase">
                  My Codex App
                </p>
                <h2 className="font-heading text-xl tracking-[-0.04em]">
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

      <nav className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 rounded-[24px] bg-card/88 p-2 shadow-[0_20px_56px_rgba(0,0,0,0.36)] backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-8 before:-top-5 before:h-5 before:bg-linear-to-t before:from-card/40 before:to-transparent lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 font-mono text-[0.68rem] font-medium text-muted-foreground transition",
                  isActive && "bg-primary/14 text-primary"
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
