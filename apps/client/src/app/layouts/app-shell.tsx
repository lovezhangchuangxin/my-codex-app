import { Outlet } from 'react-router-dom';

import { Header } from '@/components/layout/header';

export function AppShell() {
  return (
    <div className="flex h-svh flex-col bg-background">
      <Header />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
