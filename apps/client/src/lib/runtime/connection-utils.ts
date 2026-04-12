export function formatConnectionKind(kind: string): string {
  switch (kind) {
    case "authenticated":
      return "Connected";
    case "refreshing":
      return "Refreshing...";
    case "reconnecting":
      return "Reconnecting...";
    case "resyncing":
      return "Resyncing...";
    case "disconnected":
      return "Disconnected";
    case "unpaired":
      return "Not paired";
    case "expired":
      return "Session expired";
    case "revoked":
      return "Device revoked";
    default:
      return kind;
  }
}
