import { Suspense, lazy } from "react";
import { Navigate, createBrowserRouter, useLocation } from "react-router-dom";

import { AppShell } from "@/app/layouts/app-shell";

const ThreadsShell = lazy(async () => {
  const module = await import("@/app/layouts/threads-shell");
  return { default: module.ThreadsShell };
});

const InboxPanel = lazy(async () => {
  const module = await import("@/features/requests/components/inbox-panel");
  return { default: module.InboxPanel };
});

const ConnectionRoute = lazy(async () => {
  const module = await import("@/features/connection/routes/connection-route");
  return { default: module.ConnectionRoute };
});

function LegacyEntryRedirect() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const threadId = searchParams.get("threadId");

  return (
    <Navigate
      replace
      to={threadId ? `/threads/${encodeURIComponent(threadId)}` : "/threads"}
    />
  );
}

function RouteFallback() {
  return (
    <div className="rounded-[28px] bg-card/70 p-6 shadow-[0_20px_56px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <div className="space-y-3">
        <div className="h-4 w-28 rounded-full bg-muted/70" />
        <div className="h-10 w-56 rounded-full bg-muted/70" />
        <div className="h-4 w-full rounded-full bg-muted/60" />
      </div>
    </div>
  );
}

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <LegacyEntryRedirect />
      },
      {
        path: "threads",
        element: withSuspense(<ThreadsShell />)
      },
      {
        path: "threads/:threadId",
        element: withSuspense(<ThreadsShell />)
      },
      {
        path: "inbox",
        element: withSuspense(<InboxPanel />)
      },
      {
        path: "connection",
        element: withSuspense(<ConnectionRoute />)
      },
      {
        path: "*",
        element: <Navigate replace to="/threads" />
      }
    ]
  }
]);
