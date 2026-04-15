import { Suspense, lazy, type ReactNode } from 'react';

const RuntimeProvider = lazy(() =>
  import('./runtime-provider').then((m) => ({ default: m.RuntimeProvider })),
);

function SplashFallback() {
  return (
    <div
      className="flex h-full items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-label="Loading application"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
    </div>
  );
}

export function LazyRuntimeProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<SplashFallback />}>
      <RuntimeProvider>{children}</RuntimeProvider>
    </Suspense>
  );
}
