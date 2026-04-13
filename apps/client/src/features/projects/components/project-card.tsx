import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import type { ProjectSummary } from '@my-codex-app/protocol';

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

  return (
    <Card
      className={cn(
        'rounded-lg border border-subtle/8 bg-card/78 transition-all duration-200 hover:border-subtle/12 hover:bg-card/92',
        isSelected ? 'border-primary/22 bg-card' : '',
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
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-heading text-base tracking-[-0.04em] md:text-[1.05rem]">
                {project.displayName}
              </p>
              {project.imported ? (
                <Badge variant="outline">
                  {t('project.list.badge.imported')}
                </Badge>
              ) : null}
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
