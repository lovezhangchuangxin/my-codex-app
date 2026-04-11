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

export function AppShell() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-transparent">
      <div className="mx-auto flex min-h-screen w-full max-w-[1520px] gap-6 px-4 py-4 md:px-6 lg:px-8">
        <aside className="hidden lg:block lg:w-[272px]">
          <div className="sticky top-6 flex h-[calc(100svh-3rem)] flex-col overflow-hidden rounded-[24px] bg-card/55 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div className="border-b border-white/6 px-5 pt-5 pb-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-2.5 py-1 font-mono text-[0.62rem] tracking-[0.22em] text-primary uppercase">
                <Sparkles className="size-3.5" />
                Engine Terminal
              </div>
              <div className="mt-4 space-y-1.5">
                <h1 className="font-heading text-[1.8rem] leading-none tracking-[-0.06em] text-foreground">
                  My Codex App
                </h1>
                <p className="text-sm leading-5 text-muted-foreground">
                  Monitor turns, resolve approvals, and stay aligned with the local
                  bridge.
                </p>
              </div>
            </div>

            <nav className="grid gap-2 px-4 pt-4">
              {navigationItems.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-accent/60 hover:text-foreground",
                      isActive && "bg-transparent text-primary shadow-none"
                    )
                  }
                  key={item.to}
                  to={item.to}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl bg-background/60 text-muted-foreground transition",
                        location.pathname.startsWith(item.to) &&
                          "bg-background/60 text-primary"
                      )}
                    >
                      <item.icon className="size-4.5" />
                    </span>
                    {item.label}
                  </span>
                    <span className="font-mono text-[0.64rem] uppercase opacity-65">
                      {item.label === "Threads" ? "Primary" : "View"}
                    </span>
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto space-y-3 border-t border-white/6 bg-background/30 px-5 py-4">
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
              <p className="text-sm leading-5 text-muted-foreground">
                The bridge is still the only process that talks directly to Codex
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
          <main className="space-y-5">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 bg-background/88 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-5 before:-translate-y-full before:bg-linear-to-t before:from-card/40 before:to-transparent lg:hidden">
        <div className="grid grid-cols-3 gap-2 rounded-[18px] bg-card/88 p-2 shadow-[0_20px_56px_rgba(0,0,0,0.36)]">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-xl px-3 py-2 font-mono text-[0.68rem] font-medium text-muted-foreground transition",
                  isActive && "bg-transparent text-primary"
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
