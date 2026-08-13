export type InboxState = "open" | "done" | "dismissed";

export type InboxPriority = "p1" | "p2";

export type InboxView = "active" | "done";

export type InboxActivityType = "created" | "brief_updated" | "state_changed";

export type InboxActorType = "system" | "user" | "agent";

export interface ListInboxInput {
  view: InboxView;
  query?: string;
  cursor?: string;
  limit: number;
}

export interface SaveInboxBriefInput {
  summary: string | null;
  hypothesis: string | null;
  nextAction: string | null;
}
