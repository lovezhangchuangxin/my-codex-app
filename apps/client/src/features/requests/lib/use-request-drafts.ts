import { useState } from "react";

import { toRequestKey } from "@/features/requests/lib/request-utils";
import type { JsonRpcRequestId } from "@my-codex-app/protocol";

export function useRequestDrafts() {
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  function setDraft(requestId: JsonRpcRequestId, questionId: string, value: string) {
    const requestKey = toRequestKey(requestId);
    setDrafts((current) => ({
      ...current,
      [requestKey]: {
        ...(current[requestKey] ?? {}),
        [questionId]: value
      }
    }));
  }

  function getDraft(requestId: JsonRpcRequestId, questionId: string) {
    return drafts[toRequestKey(requestId)]?.[questionId] ?? "";
  }

  function clearRequest(requestId: JsonRpcRequestId) {
    const requestKey = toRequestKey(requestId);
    setDrafts((current) => {
      const remaining = { ...current };
      delete remaining[requestKey];
      return remaining;
    });
  }

  return {
    clearRequest,
    getDraft,
    setDraft
  };
}
