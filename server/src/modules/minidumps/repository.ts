import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { ingestEnvelopes, ingestItems } from "../ingest/schema.js";
import { events } from "../issues/schema.js";
import { minidumps } from "./schema.js";

export interface MinidumpIngestItem {
  id: string;
  envelopeId: string;
  projectId: string;
  status: string;
  header: Record<string, unknown>;
  payload: Buffer | null;
  eventId: string | null;
}

export interface StoreMinidumpInput {
  projectId: string;
  ingestItemId: string;
  eventId: string | null;
  fileName: string;
  contentType: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

export class MinidumpRepository {
  public constructor(private readonly database: Database) {}

  async findIngestItem(itemId: string): Promise<MinidumpIngestItem | null> {
    const [item] = await this.database.db
      .select({
        id: ingestItems.id,
        envelopeId: ingestItems.envelopeId,
        projectId: ingestEnvelopes.projectId,
        status: ingestItems.status,
        header: ingestItems.header,
        payload: ingestItems.payload,
        eventId: ingestItems.eventId,
      })
      .from(ingestItems)
      .innerJoin(ingestEnvelopes, eq(ingestEnvelopes.id, ingestItems.envelopeId))
      .where(and(eq(ingestItems.id, itemId), eq(ingestItems.type, "attachment")))
      .limit(1);
    return item ?? null;
  }

  async complete(input: StoreMinidumpInput): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      await transaction
        .insert(minidumps)
        .values(input)
        .onConflictDoUpdate({
          target: minidumps.ingestItemId,
          set: {
            eventId: input.eventId,
            fileName: input.fileName,
            contentType: input.contentType,
            storageKey: input.storageKey,
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
          },
        });
      await transaction
        .update(ingestItems)
        .set({
          payload: null,
          status: "processed",
          processedAt: new Date(),
          attempts: sql`${ingestItems.attempts} + 1`,
        })
        .where(eq(ingestItems.id, input.ingestItemId));
    });
  }

  async markInvalid(itemId: string, errorCode: string): Promise<void> {
    await this.database.db
      .update(ingestItems)
      .set({
        payload: null,
        status: "failed",
        errorCode,
        processedAt: new Date(),
        attempts: sql`${ingestItems.attempts} + 1`,
      })
      .where(eq(ingestItems.id, itemId));
  }

  listForEvent(projectId: string, eventId: string) {
    return this.database.db
      .select()
      .from(minidumps)
      .where(and(eq(minidumps.projectId, projectId), eq(minidumps.eventId, eventId)))
      .orderBy(minidumps.createdAt);
  }

  listForIssue(issueId: string) {
    return this.database.db
      .select(getTableColumns(minidumps))
      .from(minidumps)
      .innerJoin(
        events,
        and(eq(events.projectId, minidumps.projectId), eq(events.eventId, minidumps.eventId)),
      )
      .where(eq(events.issueId, issueId))
      .orderBy(desc(minidumps.createdAt));
  }

  async findById(id: string) {
    const [row] = await this.database.db
      .select()
      .from(minidumps)
      .where(eq(minidumps.id, id))
      .limit(1);
    return row ?? null;
  }
}
