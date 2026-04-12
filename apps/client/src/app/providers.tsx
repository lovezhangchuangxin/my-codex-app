import type { ReactNode } from "react";

import { PwaUpdatePrompt } from "@/components/common/pwa-update-prompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/i18n/provider";
import { RuntimeProvider } from "@/lib/runtime/runtime-provider";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { Toaster } from "sonner";

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      position="top-center"
      richColors
      theme={theme === "light" ? "light" : "dark"}
      toastOptions={{
        className: "font-sans"
      }}
    />
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <TooltipProvider>
          <RuntimeProvider>
            {children}
            <PwaUpdatePrompt />
            <ThemedToaster />
          </RuntimeProvider>
        </TooltipProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
