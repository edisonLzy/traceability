import type { AppRouterOutputs } from "@renderer/lib/trpc-types";

export type InboxListItem = AppRouterOutputs["inbox"]["list"]["data"][number];
export type InboxDetail = NonNullable<AppRouterOutputs["inbox"]["get"]>;
export type InboxActivity = InboxDetail["activities"][number];
export type InboxState = InboxListItem["state"];

export function inboxStateLabel(state: InboxState): string {
  if (state === "done") return "Done";
  if (state === "dismissed") return "Dismissed";
  return "Open";
}

export function activityDescription(activity: InboxActivity): string {
  if (activity.type === "created") return "Created from a new unresolved issue";
  if (activity.type === "brief_updated") return "Investigation brief updated";

  const fromState = stringPayload(activity.payload, "fromState");
  const toState = stringPayload(activity.payload, "toState");
  const reason = stringPayload(activity.payload, "reason");
  if (reason === "issue_regressed") return "Issue recurred and returned to Open";
  if (toState === "done") return "Marked Done and resolved the linked issue";
  if (toState === "dismissed") return "Dismissed and ignored the linked issue";
  if (toState === "open") return "Reopened for triage";
  if (fromState && toState) return `Status changed from ${fromState} to ${toState}`;
  return "Inbox status updated";
}

export function shortIssueId(issueId: string): string {
  return issueId.slice(0, 8).toUpperCase();
}

export function formatInboxDate(value: Date | string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stringPayload(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}
