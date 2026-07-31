export type IssueStatus = "unresolved" | "resolved" | "ignored";

export interface ListIssuesInput {
  cursor?: string;
  limit: number;
}

export interface ListEventsInput {
  limit: number;
}

export interface UpdateIssueInput {
  status: IssueStatus;
}
