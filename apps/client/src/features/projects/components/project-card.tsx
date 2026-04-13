import { Folder } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import type { ProjectSummary } from '@my-codex-app/protocol';

const PALETTE_HUES = [210, 265, 155, 35, 340, 190, 25, 170];

function projectHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE_HUES[Math.abs(hash) % PALETTE_HUES.length]!;
}

export function ProjectCard({
  isSelected,
  onOpen,
  project,
}: {
  isSelected: boolean;
  onOpen: (projectPath: string) => void;
  project: ProjectSummary;
}) {
  const { formatRelativeTime, t } = useI18n();
  const iconColor = `hsl(${projectHue(project.displayName)}, 65%, 55%)`;

  return (
    <Card
      className={cn(
        'rounded-lg border border-subtle/8 bg-card/78 transition-all duration-200 hover:border-subtle/12 hover:bg-card/92',
        isSelected
          ? 'border-primary/35 bg-card shadow-[0_0_0_1.5px_rgba(var(--primary),0.35),0_0_20px_rgba(var(--primary),0.14)]'
          : '',
      )}
    >
      <button
        className="w-full text-left"
        onClick={() => {
          onOpen(project.path);
        }}
        type="button"
      >
        <CardContent className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Folder
                className="size-[1.15rem] shrink-0"
                style={{ color: iconColor }}
              />
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <p className="truncate font-heading text-base tracking-[-0.04em] md:text-[1.05rem]">
                  {project.displayName}
                </p>
                {project.hasActiveSession ? (
                  <Badge
                    className="bg-primary/14 text-primary"
                    variant="secondary"
                  >
                    {t('project.list.badge.active')}
                  </Badge>
                ) : null}
                {!project.available ? (
                  <Badge
                    className="bg-destructive/10 text-destructive"
                    variant="secondary"
                  >
                    {t('project.list.badge.unavailable')}
                  </Badge>
                ) : null}
              </div>
            </div>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {project.path}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              className="border border-subtle/8 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground"
              variant="outline"
            >
              {t('project.list.meta.sessions', { count: project.sessionCount })}
            </Badge>
            <Badge
              className="border border-subtle/8 bg-background/55 font-mono text-[0.7rem] uppercase text-muted-foreground"
              variant="outline"
            >
              {t('project.list.meta.pending', {
                count: project.pendingRequestCount,
              })}
            </Badge>
          </div>

          <div className="rounded-[10px] border border-subtle/8 bg-background/45 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
            {project.lastActiveAt
              ? t('project.list.meta.lastActive', {
                  relative: formatRelativeTime(project.lastActiveAt),
                })
              : t('project.list.meta.noActivity')}
          </div>
        </CardContent>
      </button>
    </Card>
  );
}
