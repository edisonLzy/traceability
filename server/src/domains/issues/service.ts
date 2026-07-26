import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../../db/client.js";
import { events, issues } from "./db.js";

const CursorSchema = z.string().optional();
const LimitSchema = z.coerce.number().int().min(1).max(100).default(50);

export const UpdateIssueSchema = z.object({
  status: z.enum(["unresolved", "resolved", "ignored"]),
});

export class IssueService {
  public constructor(private readonly database: Database) {}

  async listForProject(projectId: string, rawQuery: unknown) {
    const query = z.object({ cursor: CursorSchema, limit: LimitSchema }).parse(rawQuery);
    const cursor = decodeCursor(query.cursor);
    const conditions = [eq(issues.projectId, projectId)];
    if (cursor) {
      conditions.push(
        or(
          lt(issues.lastSeen, cursor.lastSeen),
          and(eq(issues.lastSeen, cursor.lastSeen), lt(issues.id, cursor.id)),
        )!,
      );
    }
    const rows = await this.database.db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(desc(issues.lastSeen), desc(issues.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;
    const finalIssue = data.at(-1);
    return {
      data,
      nextCursor: hasMore && finalIssue ? encodeCursor(finalIssue.lastSeen, finalIssue.id) : null,
    };
  }

  async getIssue(issueId: string) {
    const [issue] = await this.database.db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .limit(1);
    return issue ?? null;
  }

  async listEvents(issueId: string, rawQuery: unknown) {
    const query = z.object({ limit: LimitSchema }).parse(rawQuery);
    return this.database.db
      .select()
      .from(events)
      .where(eq(events.issueId, issueId))
      .orderBy(desc(events.eventTimestamp), desc(events.id))
      .limit(query.limit);
  }

  async updateIssue(issueId: string, raw: unknown) {
    const input = UpdateIssueSchema.parse(raw);
    const [issue] = await this.database.db
      .update(issues)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(issues.id, issueId))
      .returning();
    return issue ?? null;
  }
}

interface IssueCursor {
  lastSeen: Date;
  id: string;
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
    throw new z.ZodError([{ code: "custom", path: ["cursor"], message: "cursor is invalid" }]);
  }
}
