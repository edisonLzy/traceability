import { and, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { issues } from "../issues/schema.js";
import { inboxActivities, inboxItems } from "./schema.js";
import type { InboxState, ListInboxInput, SaveInboxBriefInput } from "./types.js";

export interface InboxCursor {
  lastActivityAt: Date;
  id: string;
}

export class InboxRepository {
  public constructor(private readonly database: Database) {}

  listForProject(projectId: string, input: ListInboxInput, cursor: InboxCursor | undefined) {
    const states: InboxState[] = input.view === "active" ? ["open"] : ["done", "dismissed"];
    const conditions = [eq(inboxItems.projectId, projectId), inArray(inboxItems.state, states)];
    if (input.query) {
      conditions.push(
        or(
          ilike(issues.title, `%${input.query}%`),
          sql`${issues.id}::text ILIKE ${`%${input.query}%`}`,
        )!,
      );
    }
    if (cursor) {
      conditions.push(
        or(
          lt(inboxItems.lastActivityAt, cursor.lastActivityAt),
          and(eq(inboxItems.lastActivityAt, cursor.lastActivityAt), lt(inboxItems.id, cursor.id)),
        )!,
      );
    }

    return this.database.db
      .select(inboxItemSelection)
      .from(inboxItems)
      .innerJoin(issues, eq(issues.id, inboxItems.issueId))
      .where(and(...conditions))
      .orderBy(desc(inboxItems.lastActivityAt), desc(inboxItems.id))
      .limit(input.limit + 1);
  }

  async findById(inboxItemId: string) {
    const [item] = await this.database.db
      .select(inboxItemSelection)
      .from(inboxItems)
      .innerJoin(issues, eq(issues.id, inboxItems.issueId))
      .where(eq(inboxItems.id, inboxItemId))
      .limit(1);
    if (!item) return null;

    const activities = await this.database.db
      .select()
      .from(inboxActivities)
      .where(eq(inboxActivities.inboxItemId, inboxItemId))
      .orderBy(desc(inboxActivities.createdAt), desc(inboxActivities.id));
    return { ...item, activities };
  }

  transitionByItemId(inboxItemId: string, targetState: InboxState, actorId: string) {
    return this.transition({ inboxItemId, targetState, actorId });
  }

  transitionByIssueId(issueId: string, targetState: InboxState, actorId: string) {
    return this.transition({ issueId, targetState, actorId });
  }

  async saveBrief(inboxItemId: string, brief: SaveInboxBriefInput, actorId: string) {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.id, inboxItemId))
        .limit(1)
        .for("update");
      if (!current) return null;

      const now = new Date();
      const [item] = await transaction
        .update(inboxItems)
        .set({ ...brief, lastActivityAt: now, updatedAt: now })
        .where(eq(inboxItems.id, inboxItemId))
        .returning();
      if (!item) return null;

      await transaction.insert(inboxActivities).values({
        inboxItemId,
        type: "brief_updated",
        actorType: "agent",
        actorId,
        payload: {
          fields: ["summary", "hypothesis", "nextAction"],
        },
        createdAt: now,
      });
      return item;
    });
  }

  private async transition(input: {
    inboxItemId?: string;
    issueId?: string;
    targetState: InboxState;
    actorId: string;
  }) {
    return this.database.db.transaction(async (transaction) => {
      const [itemReference] = input.inboxItemId
        ? await transaction
            .select({ issueId: inboxItems.issueId })
            .from(inboxItems)
            .where(eq(inboxItems.id, input.inboxItemId))
            .limit(1)
        : [];
      const issueId = itemReference?.issueId ?? input.issueId;
      if (!issueId) return null;

      const [issue] = await transaction
        .select()
        .from(issues)
        .where(eq(issues.id, issueId))
        .limit(1)
        .for("update");
      if (!issue) return null;

      const [currentItem] = await transaction
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.issueId, issue.id))
        .limit(1)
        .for("update");
      if (input.inboxItemId && currentItem?.id !== input.inboxItemId) return null;

      const issueStatus = issueStatusForState(input.targetState);
      const now = new Date();
      const [updatedIssue] = await transaction
        .update(issues)
        .set({ status: issueStatus, updatedAt: now })
        .where(eq(issues.id, issue.id))
        .returning();
      if (!updatedIssue) return null;

      if (!currentItem) {
        const [createdItem] = await transaction
          .insert(inboxItems)
          .values({
            projectId: issue.projectId,
            issueId: issue.id,
            state: input.targetState,
            triggerReason: "Existing issue added to Inbox",
            completedAt: input.targetState === "open" ? null : now,
            lastActivityAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!createdItem) return null;
        await transaction.insert(inboxActivities).values({
          inboxItemId: createdItem.id,
          type: "created",
          actorType: "user",
          actorId: input.actorId,
          payload: { state: input.targetState },
          createdAt: now,
        });
        return { item: createdItem, issue: updatedIssue };
      }

      if (currentItem.state === input.targetState) {
        return { item: currentItem, issue: updatedIssue };
      }

      const [updatedItem] = await transaction
        .update(inboxItems)
        .set({
          state: input.targetState,
          completedAt: input.targetState === "open" ? null : now,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(inboxItems.id, currentItem.id))
        .returning();
      if (!updatedItem) return null;

      await transaction.insert(inboxActivities).values({
        inboxItemId: currentItem.id,
        type: "state_changed",
        actorType: "user",
        actorId: input.actorId,
        payload: { fromState: currentItem.state, toState: input.targetState },
        createdAt: now,
      });
      return { item: updatedItem, issue: updatedIssue };
    });
  }
}

function issueStatusForState(state: InboxState): "unresolved" | "resolved" | "ignored" {
  if (state === "done") return "resolved";
  if (state === "dismissed") return "ignored";
  return "unresolved";
}

const inboxItemSelection = {
  id: inboxItems.id,
  projectId: inboxItems.projectId,
  issueId: inboxItems.issueId,
  state: inboxItems.state,
  priority: inboxItems.priority,
  triggerReason: inboxItems.triggerReason,
  summary: inboxItems.summary,
  hypothesis: inboxItems.hypothesis,
  nextAction: inboxItems.nextAction,
  lastActivityAt: inboxItems.lastActivityAt,
  completedAt: inboxItems.completedAt,
  createdAt: inboxItems.createdAt,
  updatedAt: inboxItems.updatedAt,
  issue: {
    id: issues.id,
    title: issues.title,
    type: issues.type,
    status: issues.status,
    firstSeen: issues.firstSeen,
    lastSeen: issues.lastSeen,
    eventCount: issues.eventCount,
  },
};
