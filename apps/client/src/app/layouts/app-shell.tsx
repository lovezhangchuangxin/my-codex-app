import { Outlet } from "react-router-dom";

import { Header } from "@/components/layout/header";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
