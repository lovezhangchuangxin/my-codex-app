import { Sparkles } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

export function ThreadDetailEmptyState({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <Card className="h-full rounded-none bg-card/68">
      <CardContent className="grid h-full place-items-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Sparkles className="size-6" />
          </div>
          <h2 className="font-heading text-2xl tracking-[-0.04em]">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
