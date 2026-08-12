import { and, desc, eq, lt, or } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { events, issues } from "./schema.js";

export interface IssueCursor {
  lastSeen: Date;
  id: string;
}

export class IssueRepository {
  public constructor(private readonly database: Database) {}

  listForProject(projectId: string, cursor: IssueCursor | undefined, limit: number) {
    const conditions = [eq(issues.projectId, projectId)];
    if (cursor) {
      conditions.push(
        or(
          lt(issues.lastSeen, cursor.lastSeen),
          and(eq(issues.lastSeen, cursor.lastSeen), lt(issues.id, cursor.id)),
        )!,
      );
    }
    return this.database.db
      .select()
      .from(issues)
      .where(and(...conditions))
      .orderBy(desc(issues.lastSeen), desc(issues.id))
      .limit(limit + 1);
  }

  async findById(issueId: string) {
    const [issue] = await this.database.db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .limit(1);
    return issue ?? null;
  }

  listEvents(issueId: string, limit: number) {
    return this.database.db
      .select()
      .from(events)
      .where(eq(events.issueId, issueId))
      .orderBy(desc(events.eventTimestamp), desc(events.id))
      .limit(limit);
  }
}
