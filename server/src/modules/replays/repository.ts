import { and, desc, eq, lt, or, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { ingestEnvelopes, ingestItems } from "../ingest/schema.js";
import { replaySessions, replaySegments } from "./schema.js";

export interface SessionRow {
  id: string;
  projectId: string;
  replayId: string;
  platform: string | null;
  release: string | null;
  environment: string | null;
  replayType: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  urlList: string[] | null;
  errorIds: string[] | null;
  traceIds: string[] | null;
  segmentCount: number;
  totalBytes: number;
  createdAt: Date;
}

export interface SegmentRow {
  id: string;
  replayId: string;
  segmentId: number;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}

export interface UpsertSessionInput {
  projectId: string;
  replayId: string;
  platform: string | null;
  release: string | null;
  environment: string | null;
  replayType: string;
  startedAt: Date;
  urlList: string[];
  errorIds: string[];
  traceIds: string[];
}

export interface InsertSegmentInput {
  replayId: string;
  segmentId: number;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

export interface IngestItemWithProject {
  id: string;
  status: string;
  payload: Buffer | null;
  payloadJson: Record<string, unknown> | null;
  header: Record<string, unknown>;
  projectId: string;
  envelopeId: string;
}

export class ReplayRepository {
  public constructor(private readonly database: Database) {}

  async upsertSession(input: UpsertSessionInput): Promise<SessionRow> {
    const [row] = await this.database.db
      .insert(replaySessions)
      .values({
        projectId: input.projectId,
        replayId: input.replayId,
        platform: input.platform,
        release: input.release,
        environment: input.environment,
        replayType: input.replayType,
        startedAt: input.startedAt,
        urlList: input.urlList,
        errorIds: input.errorIds,
        traceIds: input.traceIds,
      })
      .onConflictDoUpdate({
        target: [replaySessions.projectId, replaySessions.replayId],
        set: {
          platform: sql`COALESCE(${replaySessions.platform}, excluded.platform)`,
          release: sql`COALESCE(${replaySessions.release}, excluded.release)`,
          environment: sql`COALESCE(${replaySessions.environment}, excluded.environment)`,
          replayType: input.replayType,
          urlList: input.urlList,
          errorIds: input.errorIds,
          traceIds: input.traceIds,
          finishedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("replay session upsert did not return a row");
    return row;
  }

  async insertSegment(input: InsertSegmentInput): Promise<SegmentRow | null> {
    const [row] = await this.database.db
      .insert(replaySegments)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async incrementSegmentCount(replaySessionId: string, sizeBytes: number): Promise<void> {
    await this.database.db
      .update(replaySessions)
      .set({
        segmentCount: sql`${replaySessions.segmentCount} + 1`,
        totalBytes: sql`${replaySessions.totalBytes} + ${sizeBytes}`,
      })
      .where(eq(replaySessions.id, replaySessionId));
  }

  async findSessionByReplayId(projectId: string, replayId: string): Promise<SessionRow | null> {
    const [row] = await this.database.db
      .select()
      .from(replaySessions)
      .where(and(eq(replaySessions.projectId, projectId), eq(replaySessions.replayId, replayId)))
      .limit(1);
    return row ?? null;
  }

  async findSessionsByProject(
    projectId: string,
    options: {
      limit?: number;
      errorId?: string;
      cursor?: { startedAt: Date; id: string };
    },
  ): Promise<SessionRow[]> {
    const conditions = [eq(replaySessions.projectId, projectId)];
    if (options.errorId) {
      conditions.push(
        sql`${replaySessions.errorIds} @> ${JSON.stringify([options.errorId])}::jsonb`,
      );
    }
    if (options.cursor) {
      const cursorCondition = or(
        lt(replaySessions.startedAt, options.cursor.startedAt),
        and(
          eq(replaySessions.startedAt, options.cursor.startedAt),
          lt(replaySessions.id, options.cursor.id),
        ),
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }
    return this.database.db
      .select()
      .from(replaySessions)
      .where(and(...conditions))
      .orderBy(desc(replaySessions.startedAt), desc(replaySessions.id))
      .limit(options.limit ?? 50);
  }

  listSegmentsByReplayId(replaySessionId: string): Promise<SegmentRow[]> {
    return this.database.db
      .select()
      .from(replaySegments)
      .where(eq(replaySegments.replayId, replaySessionId))
      .orderBy(replaySegments.segmentId);
  }

  async findSegment(replaySessionId: string, segmentId: number): Promise<SegmentRow | null> {
    const [row] = await this.database.db
      .select()
      .from(replaySegments)
      .where(
        and(eq(replaySegments.replayId, replaySessionId), eq(replaySegments.segmentId, segmentId)),
      )
      .limit(1);
    return row ?? null;
  }

  async deleteSessionByReplayId(projectId: string, replayId: string): Promise<SessionRow | null> {
    const [row] = await this.database.db
      .delete(replaySessions)
      .where(and(eq(replaySessions.projectId, projectId), eq(replaySessions.replayId, replayId)))
      .returning();
    return row ?? null;
  }

  async deleteSegmentsByReplayId(replaySessionId: string): Promise<void> {
    await this.database.db
      .delete(replaySegments)
      .where(eq(replaySegments.replayId, replaySessionId));
  }

  async findIngestItem(itemId: string): Promise<IngestItemWithProject | null> {
    const [row] = await this.database.db
      .select({
        id: ingestItems.id,
        status: ingestItems.status,
        payload: ingestItems.payload,
        payloadJson: ingestItems.payloadJson,
        header: ingestItems.header,
        projectId: ingestEnvelopes.projectId,
        envelopeId: ingestEnvelopes.id,
      })
      .from(ingestItems)
      .innerJoin(ingestEnvelopes, eq(ingestEnvelopes.id, ingestItems.envelopeId))
      .where(eq(ingestItems.id, itemId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Find the replay_event item in the same envelope as a recording item.
   * This provides the replay_id needed to associate segments with their session.
   */
  async findReplayEventInEnvelope(
    envelopeId: string,
  ): Promise<{ payloadJson: Record<string, unknown> | null } | null> {
    const [row] = await this.database.db
      .select({ payloadJson: ingestItems.payloadJson })
      .from(ingestItems)
      .where(and(eq(ingestItems.envelopeId, envelopeId), eq(ingestItems.type, "replay_event")))
      .limit(1);
    return row ?? null;
  }
}
