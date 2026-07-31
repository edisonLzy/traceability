import { ZodError } from "zod";

import type { IssueCursor, IssueRepository } from "./repository.js";
import type { ListEventsInput, ListIssuesInput, UpdateIssueInput } from "./types.js";

export class IssueService {
  public constructor(private readonly repository: IssueRepository) {}

  async listForProject(projectId: string, query: ListIssuesInput) {
    const rows = await this.repository.listForProject(
      projectId,
      decodeCursor(query.cursor),
      query.limit,
    );
    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;
    const finalIssue = data.at(-1);
    return {
      data,
      nextCursor: hasMore && finalIssue ? encodeCursor(finalIssue.lastSeen, finalIssue.id) : null,
    };
  }

  getIssue(issueId: string) {
    return this.repository.findById(issueId);
  }

  listEvents(issueId: string, query: ListEventsInput) {
    return this.repository.listEvents(issueId, query.limit);
  }

  updateIssue(issueId: string, input: UpdateIssueInput) {
    return this.repository.updateStatus(issueId, input.status);
  }
}

function encodeCursor(lastSeen: Date, id: string): string {
  return Buffer.from(JSON.stringify({ lastSeen: lastSeen.toISOString(), id })).toString(
    "base64url",
  );
}

function decodeCursor(raw: string | undefined): IssueCursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    const value = parsed as { lastSeen?: unknown; id?: unknown };
    const lastSeen = typeof value.lastSeen === "string" ? new Date(value.lastSeen) : undefined;
    if (!lastSeen || Number.isNaN(lastSeen.valueOf()) || typeof value.id !== "string") {
      throw new Error("invalid");
    }
    return { lastSeen, id: value.id };
  } catch {
    throw new ZodError([{ code: "custom", path: ["cursor"], message: "cursor is invalid" }]);
  }
}
