import type {
  JsonRpcRequestId,
  PendingRequest,
  RequestPermissionProfile,
  ThreadSummary
} from "@my-codex-app/protocol";

export interface PendingRequestEntry {
  request: PendingRequest;
  thread: Pick<ThreadSummary, "id" | "cwd" | "name" | "preview" | "status">;
}

export function toRequestKey(requestId: JsonRpcRequestId) {
  return typeof requestId === "string" ? `string:${requestId}` : `number:${requestId}`;
}

export function toQuestionAnswerKey(requestId: JsonRpcRequestId, questionId: string) {
  return `${toRequestKey(requestId)}:${questionId}`;
}

export function buildPendingRequestEntries(threads: ThreadSummary[]): PendingRequestEntry[] {
  return threads
    .flatMap((thread) =>
      thread.pendingRequests.map((request) => ({
        request,
        thread
      }))
    )
    .sort((left, right) => right.request.requestedAt - left.request.requestedAt);
}

export function getRequestKindLabel(request: PendingRequest) {
  switch (request.kind) {
    case "command":
      return "Command approval";
    case "fileChange":
      return "File change";
    case "permissions":
      return "Permission request";
    case "userInput":
      return "User input";
  }
}

export function getRequestDescription(request: PendingRequest) {
  switch (request.kind) {
    case "command":
      return request.reason ?? "Codex requested permission to run a command.";
    case "fileChange":
      return request.reason ?? "Codex proposed a filesystem change.";
    case "permissions":
      return request.reason ?? "Codex asked for additional execution permissions.";
    case "userInput":
      return "Codex needs more structured input to continue the turn.";
  }
}

export function describePermissionProfile(profile: RequestPermissionProfile) {
  const details: string[] = [];

  if (profile.network?.enabled) {
    details.push("Network access");
  }

  if (profile.fileSystem?.read?.length) {
    details.push(`Read: ${profile.fileSystem.read.join(", ")}`);
  }

  if (profile.fileSystem?.write?.length) {
    details.push(`Write: ${profile.fileSystem.write.join(", ")}`);
  }

  return details.length > 0 ? details : ["Custom permissions requested"];
}
