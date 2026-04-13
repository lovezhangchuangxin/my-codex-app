import { useDeferredValue, useEffect, useState } from "react";
import { FolderPlus, LoaderCircle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n/use-i18n";
import type {
  ProjectImportRequest,
  ProjectSearchRequest,
  ProjectSearchResponse,
  ProjectSummary
} from "@my-codex-app/protocol";

export function ProjectImportSheet({
  isDesktop,
  onImportProject,
  onOpenChange,
  onSearchProjects,
  open
}: {
  isDesktop: boolean;
  onImportProject: (request: ProjectImportRequest) => Promise<ProjectSummary>;
  onOpenChange: (open: boolean) => void;
  onSearchProjects: (request: ProjectSearchRequest) => Promise<ProjectSearchResponse>;
  open: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [matchesState, setMatchesState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; matches: ProjectSearchResponse["matches"] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMatchesState({ kind: "idle" });
      setSubmitError(null);
      setSubmitting(false);
      return;
    }

    let cancelled = false;
    setMatchesState({ kind: "loading" });

    void onSearchProjects({ query: deferredQuery }).then(
      (response) => {
        if (cancelled) {
          return;
        }
        setMatchesState({
          kind: "ready",
          matches: response.matches
        });
      },
      (error: unknown) => {
        if (cancelled) {
          return;
        }
        setMatchesState({
          kind: "error",
          message: error instanceof Error ? error.message : t("project.import.error.search")
        });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, onSearchProjects, open, t]);

  async function handleImport(nextPath = query) {
    setSubmitting(true);
    setSubmitError(null);

    try {
      await onImportProject({ path: nextPath });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t("project.import.error.import")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={
          isDesktop
            ? "w-full border-l border-subtle/6 bg-card/95 p-0 sm:max-w-lg"
            : "h-svh max-h-svh w-full rounded-none border-t border-subtle/6 bg-card/95 p-0"
        }
        side={isDesktop ? "right" : "bottom"}
      >
        <SheetHeader className="border-b border-subtle/6">
          <SheetTitle>{t("project.import.title")}</SheetTitle>
          <SheetDescription>{t("project.import.description")}</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 border-b border-subtle/6 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 font-mono"
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder={t("project.import.placeholder")}
                value={query}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("project.import.hint")}</p>
            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {matchesState.kind === "loading" ? (
                <div className="flex items-center gap-2 rounded-[14px] bg-accent/70 px-4 py-3 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("project.import.searching")}
                </div>
              ) : null}

              {matchesState.kind === "error" ? (
                <div className="rounded-[14px] bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {matchesState.message}
                </div>
              ) : null}

              {matchesState.kind === "ready" && matchesState.matches.length === 0 ? (
                <div className="rounded-[14px] bg-background/45 px-4 py-5 text-center">
                  <p className="font-medium">{t("project.import.empty.title")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("project.import.empty.message")}
                  </p>
                </div>
              ) : null}

              {matchesState.kind === "ready"
                ? matchesState.matches.map((match) => (
                    <button
                      className="w-full rounded-[16px] border border-subtle/8 bg-card/78 px-4 py-3 text-left transition-colors hover:bg-card"
                      key={`${match.kind}:${match.path}`}
                      onClick={() => {
                        void handleImport(match.path);
                      }}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{match.displayName}</p>
                        <span className="rounded-full bg-background/60 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                          {t(
                            match.kind === "knownProject"
                              ? "project.import.match.knownProject"
                              : "project.import.match.pathSuggestion"
                          )}
                        </span>
                        {match.imported ? (
                          <span className="rounded-full bg-primary/12 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-primary">
                            {t("project.import.match.imported")}
                          </span>
                        ) : null}
                        {!match.available ? (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-destructive">
                            {t("project.import.match.unavailable")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {match.path}
                      </p>
                    </button>
                  ))
                : null}
            </div>
          </div>

          <div className="border-t border-subtle/6 p-4">
            <Button
              className="w-full"
              disabled={submitting || query.trim().length === 0}
              onClick={() => {
                void handleImport();
              }}
            >
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
              {submitting ? t("project.import.submitting") : t("project.import.submit")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
