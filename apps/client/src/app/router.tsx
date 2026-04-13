import { Suspense, lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/app/layouts/app-shell';
import { AuthGuard } from '@/app/layouts/auth-guard';

const PairingScreen = lazy(async () => {
  const module = await import('@/components/pairing/pairing-screen');
  return { default: module.PairingScreen };
});

const ThreadsLayout = lazy(async () => {
  const module = await import('@/app/layouts/threads-layout');
  return { default: module.ThreadsLayout };
});

function RouteFallback() {
  return (
    <div className="rounded-xl bg-card/70 p-6">
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
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/threads" />,
      },
      {
        path: 'pair',
        element: withSuspense(<PairingScreen />),
      },
      {
        path: 'threads',
        element: <AuthGuard>{withSuspense(<ThreadsLayout />)}</AuthGuard>,
      },
      {
        path: 'threads/:threadId',
        element: <AuthGuard>{withSuspense(<ThreadsLayout />)}</AuthGuard>,
      },
      {
        path: '*',
        element: <Navigate replace to="/" />,
      },
    ],
  },
]);
