import type { ReactNode } from "react";

import { PwaUpdatePrompt } from "@/components/common/pwa-update-prompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RuntimeProvider } from "@/lib/runtime/runtime-provider";
import { Toaster } from "sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <RuntimeProvider>
        {children}
        <PwaUpdatePrompt />
        <Toaster
          position="top-center"
          richColors
          theme="light"
          toastOptions={{
            className: "font-sans"
          }}
        />
      </RuntimeProvider>
    </TooltipProvider>
  );
}
