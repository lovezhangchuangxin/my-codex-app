import { Outlet } from 'react-router-dom';

import { Header } from '@/components/layout/header';
import { appViewportHeight } from '@/platform/viewport';

export function AppShell() {
  return (
    <div
      className="flex flex-col bg-background"
      style={{ height: appViewportHeight }}
    >
      <Header />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
