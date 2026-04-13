import { Badge } from "@/components/ui/badge";
import {
  describePermissionProfile,
  getRequestDescription
} from "@/features/requests/lib/request-utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { PendingRequest } from "@my-codex-app/protocol";

export function PendingRequestBody({ request }: { request: PendingRequest }) {
  const { t } = useI18n();

  switch (request.kind) {
    case "command":
      return (
        <div className="space-y-3">
          {request.command ? (
            <div className="rounded-xl bg-black/45 p-4 font-mono text-xs leading-6">
              {request.command}
            </div>
          ) : null}
          {request.cwd ? (
            <p className="text-sm text-muted-foreground">
              {t("request.command.cwd")}: {request.cwd}
            </p>
          ) : null}
        </div>
      );
    case "fileChange":
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("request.fileChange.waiting")}</p>
          {request.grantRoot ? (
            <p className="font-mono">
              {t("request.fileChange.grantRoot", { root: request.grantRoot })}
            </p>
          ) : null}
        </div>
      );
    case "permissions":
      return (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {describePermissionProfile(request.permissions, t).map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      );
    case "userInput":
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("request.userInput.waitingQuestions", { count: request.questions.length })}</p>
          <div className="flex flex-wrap gap-2">
            {request.questions.map((question) => (
              <Badge
                className="border-0 bg-background/70 font-mono text-[0.7rem] uppercase text-muted-foreground"
                key={question.id}
                variant="outline"
              >
                {question.header}
              </Badge>
            ))}
          </div>
        </div>
      );
  }
}

export function PendingRequestTitle({ request }: { request: PendingRequest }) {
  const { t } = useI18n();
  return <>{getRequestDescription(request, t)}</>;
}
