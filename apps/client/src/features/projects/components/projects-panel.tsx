import { useDeferredValue, useState } from "react";
import { FolderPlus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProjectCard } from "@/features/projects/components/project-card";
import { matchesProjectFilter } from "@/features/projects/lib/project-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { LocalConnectionState, ProjectSummary } from "@my-codex-app/protocol";
import type { ProjectListState } from "@/features/projects/hooks/use-project-home";

export function ProjectsPanel({
  className,
  connectionState,
  onImportProject,
  onOpenProject,
  projectsState,
  selectedProjectPath
}: {
  className?: string;
  connectionState: LocalConnectionState;
  onImportProject: () => void;
  onOpenProject: (projectPath: string) => void;
  projectsState: ProjectListState;
  selectedProjectPath: string | null;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const visibleProjects =
    projectsState.kind === "ready"
      ? projectsState.projects.filter((project) =>
          matchesProjectFilter(project, deferredSearch)
        )
      : [];

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden bg-card/65", className)}>
      <CardHeader className="gap-4 border-b border-subtle/6 bg-background/35 pt-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl tracking-[-0.04em]">
            {t("project.list.title")}
          </CardTitle>
          <Button onClick={onImportProject} size="sm">
            <FolderPlus className="size-4" />
            {t("project.list.action.import")}
          </Button>
        </div>

        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full min-w-0 bg-accent pl-9 font-mono text-sm tracking-[0.02em]"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder={t("project.list.searchPlaceholder")}
            value={search}
          />
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className="h-full px-4">
          <div className="space-y-4 pb-4">
            {projectsState.kind === "loading" ? (
              <div className="grid gap-3 pt-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="rounded-[18px] bg-accent/70 p-4" key={index}>
                    <div className="space-y-3">
                      <div className="h-5 w-2/5 rounded-full bg-background/55" />
                      <div className="h-4 w-5/6 rounded-full bg-background/40" />
                      <div className="flex gap-2">
                        <div className="h-6 w-20 rounded-full bg-background/40" />
                        <div className="h-6 w-20 rounded-full bg-background/35" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {projectsState.kind === "error" ? (
              <Card className="bg-destructive/8">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-medium text-destructive">
                    {t("project.list.error.loadTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">{projectsState.message}</p>
                </CardContent>
              </Card>
            ) : null}

            {projectsState.kind === "idle" ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <FolderPlus className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {projectIdleTitle(connectionState, t)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {projectIdleMessage(connectionState, t)}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {projectsState.kind === "ready" && projectsState.projects.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <FolderPlus className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {t("project.list.empty.title")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("project.list.empty.message")}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {projectsState.kind === "ready" &&
            projectsState.projects.length > 0 &&
            visibleProjects.length === 0 ? (
              <Card className="bg-background/45">
                <CardContent className="space-y-3 pt-5 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                    <Search className="size-5" />
                  </div>
                  <p className="font-heading text-xl tracking-[-0.04em]">
                    {t("project.list.empty.noMatches.title")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("project.list.empty.noMatches.message")}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {projectsState.kind === "ready"
              ? visibleProjects.map((project: ProjectSummary) => (
                  <ProjectCard
                    isSelected={selectedProjectPath === project.path}
                    key={project.path}
                    onOpen={onOpenProject}
                    project={project}
                  />
                ))
              : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function projectIdleTitle(
  connectionState: LocalConnectionState,
  t: (key: string) => string
): string {
  switch (connectionState.kind) {
    case "unpaired":
      return t("project.idle.unpaired.title");
    case "revoked":
      return t("project.idle.revoked.title");
    case "expired":
      return t("project.idle.expired.title");
    case "refreshing":
      return t("project.idle.refreshing.title");
    case "reconnecting":
      return t("project.idle.reconnecting.title");
    case "resyncing":
      return t("project.idle.resyncing.title");
    case "disconnected":
      return t("project.idle.disconnected.title");
    default:
      return t("project.idle.generic.title");
  }
}

function projectIdleMessage(
  connectionState: LocalConnectionState,
  t: (key: string) => string
): string {
  switch (connectionState.kind) {
    case "unpaired":
      return t("project.idle.unpaired.message");
    case "revoked":
      return connectionState.message ?? t("project.idle.revoked.message");
    case "expired":
      return connectionState.message ?? t("project.idle.expired.message");
    case "refreshing":
      return t("project.idle.refreshing.message");
    case "reconnecting":
      return connectionState.message ?? t("project.idle.reconnecting.message");
    case "resyncing":
      return t("project.idle.resyncing.message");
    case "disconnected":
      return connectionState.message ?? t("project.idle.disconnected.message");
    default:
      return t("project.idle.generic.message");
  }
}
