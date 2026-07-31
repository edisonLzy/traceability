import { createHash } from "node:crypto";

import {
  ObjectNotFoundError,
  type ObjectStorage,
} from "../../infrastructure/object-storage/client.js";
import type { ReplayRepository } from "./repository.js";
import type { ReplayDetail, ReplaySegmentSummary, ReplaySessionSummary } from "./types.js";

export interface ProcessReplayEventInput {
  projectId: string;
  payload: Record<string, unknown>;
}

export interface ProcessReplayRecordingInput {
  projectId: string;
  replayId: string;
  segmentId: number;
  body: Buffer;
}

export class ReplayService {
  public constructor(
    private readonly repository: ReplayRepository,
    private readonly storage: ObjectStorage,
  ) {}

  /** Worker entry point — load the ingest item then upsert the session row. */
  async processReplayEventItem(itemId: string): Promise<void> {
    const item = await this.repository.findIngestItem(itemId);
    if (!item || item.status !== "pending") return;
    if (!item.payloadJson) return;
    await this.processReplayEvent({ projectId: item.projectId, payload: item.payloadJson });
  }

  /** Worker entry point — parse segment_id from recording payload, find replay_id from sibling replay_event. */
  async processReplayRecordingItem(itemId: string): Promise<void> {
    const item = await this.repository.findIngestItem(itemId);
    if (!item || item.status !== "pending") return;
    if (!item.payload) return;

    // The recording payload starts with a JSON header line: {"segment_id":0}\n
    const segmentId = parseSegmentId(item.payload);
    if (segmentId == null) return;

    // Find the replay_event item in the same envelope to get the replay_id
    const replayEvent = await this.repository.findReplayEventInEnvelope(item.envelopeId);
    const replayId = (replayEvent?.payloadJson as { replay_id?: string } | null)?.replay_id;
    if (!replayId) return;

    await this.processReplayRecording({
      projectId: item.projectId,
      replayId,
      segmentId,
      body: item.payload,
    });
  }

  /** Upsert the session metadata from a replay_event payload. */
  processReplayEvent(input: ProcessReplayEventInput): Promise<void> {
    const payload = input.payload as {
      replay_id?: string;
      timestamp?: number;
      replay_start_timestamp?: number;
      replay_type?: string;
      platform?: string;
      release?: string;
      environment?: string;
      urls?: string[];
      error_ids?: string[];
      trace_ids?: string[];
    };
    if (!payload.replay_id) return Promise.resolve();

    const startedAt = payload.timestamp ? new Date(payload.timestamp * 1000) : new Date();

    return this.repository
      .upsertSession({
        projectId: input.projectId,
        replayId: payload.replay_id,
        platform: payload.platform ?? null,
        release: payload.release ?? null,
        environment: payload.environment ?? null,
        replayType: payload.replay_type ?? "session",
        startedAt,
        urlList: payload.urls ?? [],
        errorIds: payload.error_ids ?? [],
        traceIds: payload.trace_ids ?? [],
      })
      .then(() => undefined);
  }

  /** Store a replay recording segment to object storage and create the DB row. */
  async processReplayRecording(input: ProcessReplayRecordingInput): Promise<void> {
    const session = await this.repository.findSessionByReplayId(input.projectId, input.replayId);
    if (session) {
      await this.storeSegment(session.id, input);
      return;
    }

    // No session yet — create a minimal one on the fly
    const newSession = await this.repository.upsertSession({
      projectId: input.projectId,
      replayId: input.replayId,
      platform: null,
      release: null,
      environment: null,
      replayType: "session",
      startedAt: new Date(),
      urlList: [],
      errorIds: [],
      traceIds: [],
    });
    await this.storeSegment(newSession.id, input);
  }

  private async storeSegment(sessionId: string, input: ProcessReplayRecordingInput): Promise<void> {
    const sha256 = createHash("sha256").update(input.body).digest("hex");
    const storageKey = buildStorageKey(input.projectId, input.replayId, input.segmentId);

    await this.storage.put(storageKey, input.body, { contentType: "application/octet-stream" });

    const segment = await this.repository.insertSegment({
      replayId: sessionId,
      segmentId: input.segmentId,
      storageKey,
      sizeBytes: input.body.byteLength,
      sha256,
    });

    if (segment) {
      await this.repository.incrementSegmentCount(sessionId, input.body.byteLength);
    }
  }

  async getReplay(projectId: string, replayId: string): Promise<ReplayDetail | null> {
    const session = await this.repository.findSessionByReplayId(projectId, replayId);
    if (!session) return null;
    const segments = await this.repository.listSegmentsByReplayId(session.id);
    return {
      session: sessionToSummary(session),
      segments: segments.map(segmentToSummary),
    };
  }

  async listReplays(
    projectId: string,
    options: { limit?: number; cursor?: string; errorId?: string } = {},
  ): Promise<{ data: ReplaySessionSummary[]; nextCursor: string | null }> {
    const limit = options.limit ?? 50;
    const cursor = decodeCursor(options.cursor);
    const rows = await this.repository.findSessionsByProject(projectId, {
      limit: limit + 1,
      errorId: options.errorId,
      cursor,
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data.at(-1);
    const nextCursor = hasMore && last ? encodeCursor(last.startedAt, last.id) : null;
    return { data: data.map(sessionToSummary), nextCursor };
  }

  async getSegment(
    projectId: string,
    replayId: string,
    segmentId: number,
  ): Promise<{ segment: ReplaySegmentSummary; body: Buffer } | null> {
    const session = await this.repository.findSessionByReplayId(projectId, replayId);
    if (!session) return null;
    const segment = await this.repository.findSegment(session.id, segmentId);
    if (!segment) return null;
    try {
      const body = await this.storage.get(segment.storageKey);
      return { segment: segmentToSummary(segment), body };
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return null;
      throw error;
    }
  }

  async deleteReplay(projectId: string, replayId: string): Promise<boolean> {
    const session = await this.repository.findSessionByReplayId(projectId, replayId);
    if (!session) return false;

    const segments = await this.repository.listSegmentsByReplayId(session.id);
    // Best-effort blob cleanup
    for (const segment of segments) {
      try {
        await this.storage.delete(segment.storageKey);
      } catch {
        // continue
      }
    }

    await this.repository.deleteSegmentsByReplayId(session.id);
    return (await this.repository.deleteSessionByReplayId(projectId, replayId)) !== null;
  }
}

/**
 * Parse the segment_id from the first line of a replay recording payload.
 * The recording format is: {"segment_id":0}\n[compressed rrweb events]
 */
function parseSegmentId(payload: Buffer): number | null {
  const newline = payload.indexOf(0x0a);
  if (newline === -1) return null;
  try {
    const header = JSON.parse(payload.subarray(0, newline).toString("utf8"));
    const segmentId = (header as Record<string, unknown>).segment_id;
    return typeof segmentId === "number" ? segmentId : null;
  } catch {
    return null;
  }
}

function buildStorageKey(projectId: string, replayId: string, segmentId: number): string {
  return `replays/${projectId}/${replayId}/${segmentId}.rrweb`;
}

function sessionToSummary(session: {
  id: string;
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
}): ReplaySessionSummary {
  return {
    id: session.id,
    replayId: session.replayId,
    platform: session.platform,
    release: session.release,
    environment: session.environment,
    replayType: session.replayType,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    durationMs: session.durationMs,
    urlList: session.urlList,
    errorIds: session.errorIds,
    traceIds: session.traceIds,
    segmentCount: session.segmentCount,
    totalBytes: session.totalBytes,
    createdAt: session.createdAt,
  };
}

function segmentToSummary(segment: {
  id: string;
  segmentId: number;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}): ReplaySegmentSummary {
  return {
    id: segment.id,
    segmentId: segment.segmentId,
    sizeBytes: segment.sizeBytes,
    sha256: segment.sha256,
    createdAt: segment.createdAt,
  };
}

function encodeCursor(startedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ startedAt: startedAt.toISOString(), id })).toString(
    "base64url",
  );
}

function decodeCursor(raw: string | undefined): { startedAt: Date; id: string } | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const { startedAt, id } = parsed as Record<string, unknown>;
    if (typeof startedAt !== "string" || typeof id !== "string") return undefined;
    const date = new Date(startedAt);
    if (Number.isNaN(date.valueOf())) return undefined;
    return { startedAt: date, id };
  } catch {
    return undefined;
  }
}
