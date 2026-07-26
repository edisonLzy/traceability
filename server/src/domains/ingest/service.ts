import { createHash } from "node:crypto";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

import { and, eq } from "drizzle-orm";

import type { Database } from "../../db/client.js";
import {
  NoopIngestionRateLimiter,
  type IngestionRateLimiter,
} from "../../infrastructure/rate-limit/project-rate-limiter.js";
import { projectKeys, projectPolicies, projects } from "../projects/db.js";
import { ingestEnvelopes, ingestItems, outcomes, outbox } from "./db.js";
import type { ParsedEnvelope, ParsedEnvelopeItem } from "./envelope-parser.js";
import { EnvelopeParseError, parseEnvelope } from "./envelope-parser.js";
import { parseAndScrubEvent, scrubValue } from "./scrubber.js";

export interface IngestLimits {
  maxDecompressedBytes: number;
  maxItems: number;
  maxItemBytes: number;
}

export class IngestRequestError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "IngestRequestError";
  }
}

interface ProjectContext {
  projectId: string;
  projectKeyId: string;
  allowedOrigins: string[];
  enabledItemTypes: string[];
  rateLimitPerSecond: number;
}

export class IngestService {
  public constructor(
    private readonly database: Database,
    private readonly limits: IngestLimits,
    private readonly rateLimiter: IngestionRateLimiter = new NoopIngestionRateLimiter(),
  ) {}

  async ingest(input: {
    pathProjectId: string;
    body: Buffer;
    contentEncoding?: string;
    origin?: string;
    userAgent?: string;
    clientIp: string;
    publicKey?: string;
  }) {
    const body = decompress(input.body, input.contentEncoding, this.limits.maxDecompressedBytes);
    let envelope: ParsedEnvelope;
    try {
      envelope = parseEnvelope(body, this.limits);
    } catch (error) {
      if (error instanceof EnvelopeParseError) {
        throw new IngestRequestError(400, "invalid_envelope", error.message);
      }
      throw error;
    }

    const dsn = extractDsn(envelope.header);
    const credentials = mergeCredentials(input.publicKey, dsn?.publicKey);
    if (!credentials)
      throw new IngestRequestError(401, "missing_auth", "missing Sentry public key");
    if (dsn?.sentryProjectId && dsn.sentryProjectId !== input.pathProjectId) {
      throw new IngestRequestError(
        403,
        "project_mismatch",
        "DSN project does not match request path",
      );
    }

    const project = await this.findProject(input.pathProjectId, credentials);
    if (!project)
      throw new IngestRequestError(403, "invalid_project_key", "unknown or disabled project key");
    if (
      project.allowedOrigins.length > 0 &&
      input.origin &&
      !project.allowedOrigins.includes(input.origin)
    ) {
      throw new IngestRequestError(403, "origin_not_allowed", "request origin is not allowed");
    }
    const rateLimit = await this.rateLimiter.consume({
      projectKeyId: project.projectKeyId,
      ip: input.clientIp,
      limit: project.rateLimitPerSecond,
    });
    if (!rateLimit.allowed) {
      throw new IngestRequestError(
        429,
        "rate_limited",
        "project ingestion rate limit exceeded",
        rateLimit.retryAfterSeconds,
      );
    }

    const preparedItems = envelope.items.map((item) => prepareItem(item, project.enabledItemTypes));
    const sanitizedEnvelope = serializeEnvelope(
      scrubValue(envelope.header) as Record<string, unknown>,
      preparedItems,
    );
    const checksum = createHash("sha256").update(sanitizedEnvelope).digest("hex");

    const result = await this.database.db.transaction(async (transaction) => {
      const [storedEnvelope] = await transaction
        .insert(ingestEnvelopes)
        .values({
          projectId: project.projectId,
          projectKeyId: project.projectKeyId,
          sentAt: parseSentAt(envelope.header.sent_at),
          origin: input.origin,
          userAgent: input.userAgent,
          checksum,
          sanitizedEnvelope,
          itemCount: preparedItems.length,
        })
        .returning();
      if (!storedEnvelope) throw new Error("ingest envelope insert did not return a row");

      const storedItems = [];
      for (const item of preparedItems) {
        const [storedItem] = await transaction
          .insert(ingestItems)
          .values({
            envelopeId: storedEnvelope.id,
            sequence: item.sequence,
            type: item.type,
            header: item.header,
            payload: item.payload,
            payloadJson: item.payloadJson,
            eventId: item.eventId,
            status: item.status,
            errorCode: item.errorCode,
          })
          .returning();
        if (!storedItem) throw new Error("ingest item insert did not return a row");
        storedItems.push(storedItem);

        await transaction.insert(outcomes).values({
          envelopeId: storedEnvelope.id,
          itemId: storedItem.id,
          category: item.status === "pending" ? "accepted" : item.status,
          reason: item.errorCode ?? (item.status === "pending" ? "accepted" : "unsupported_item"),
        });

        if (item.status === "pending") {
          await transaction.insert(outbox).values({
            itemId: storedItem.id,
            topic: `ingest.${item.type}`,
            payload: { itemId: storedItem.id },
          });
        }
      }

      return { envelope: storedEnvelope, items: storedItems };
    });

    const event = result.items.find((item) => item.type === "event" && item.status === "pending");
    return { eventId: event?.eventId, envelopeId: result.envelope.id };
  }

  private async findProject(
    rawSentryProjectId: string,
    publicKey: string,
  ): Promise<ProjectContext | null> {
    const sentryProjectId = Number(rawSentryProjectId);
    if (!Number.isSafeInteger(sentryProjectId) || sentryProjectId < 1) return null;
    const [record] = await this.database.db
      .select({
        projectId: projects.id,
        projectKeyId: projectKeys.id,
        projectEnabled: projects.enabled,
        keyStatus: projectKeys.status,
        allowedOrigins: projectPolicies.allowedOrigins,
        enabledItemTypes: projectPolicies.enabledItemTypes,
        rateLimitPerSecond: projectPolicies.rateLimitPerSecond,
      })
      .from(projects)
      .innerJoin(projectKeys, eq(projectKeys.projectId, projects.id))
      .innerJoin(projectPolicies, eq(projectPolicies.projectId, projects.id))
      .where(
        and(eq(projects.sentryProjectId, sentryProjectId), eq(projectKeys.publicKey, publicKey)),
      )
      .limit(1);

    if (!record || !record.projectEnabled || record.keyStatus !== "active") return null;
    return {
      projectId: record.projectId,
      projectKeyId: record.projectKeyId,
      allowedOrigins: record.allowedOrigins,
      enabledItemTypes: record.enabledItemTypes,
      rateLimitPerSecond: record.rateLimitPerSecond,
    };
  }
}

interface PreparedItem {
  sequence: number;
  type: string;
  header: Record<string, unknown>;
  payload: Buffer | null;
  payloadJson: Record<string, unknown> | null;
  eventId: string | null;
  status: "pending" | "ignored" | "invalid";
  errorCode: string | null;
}

function prepareItem(item: ParsedEnvelopeItem, enabledItemTypes: string[]): PreparedItem {
  const header = scrubValue(item.header) as Record<string, unknown>;
  if (item.type !== "event" || !enabledItemTypes.includes(item.type)) {
    return {
      sequence: item.sequence,
      type: item.type,
      header,
      payload: null,
      payloadJson: null,
      eventId: null,
      status: "ignored",
      errorCode: "unsupported_item",
    };
  }

  try {
    const payloadJson = parseAndScrubEvent(item.payload);
    const eventId = typeof payloadJson.event_id === "string" ? payloadJson.event_id : null;
    return {
      sequence: item.sequence,
      type: item.type,
      header,
      payload: Buffer.from(JSON.stringify(payloadJson)),
      payloadJson,
      eventId,
      status: "pending",
      errorCode: null,
    };
  } catch {
    return {
      sequence: item.sequence,
      type: item.type,
      header,
      payload: null,
      payloadJson: null,
      eventId: null,
      status: "invalid",
      errorCode: "invalid_event_json",
    };
  }
}

function decompress(body: Buffer, contentEncoding: string | undefined, maxBytes: number): Buffer {
  let decoded: Buffer;
  try {
    switch ((contentEncoding ?? "identity").toLowerCase()) {
      case "identity":
        decoded = body;
        break;
      case "gzip":
        decoded = gunzipSync(body, { maxOutputLength: maxBytes });
        break;
      case "deflate":
        decoded = inflateSync(body, { maxOutputLength: maxBytes });
        break;
      case "br":
        decoded = brotliDecompressSync(body, { maxOutputLength: maxBytes });
        break;
      default:
        throw new IngestRequestError(415, "unsupported_encoding", "unsupported content encoding");
    }
  } catch (error) {
    if (error instanceof IngestRequestError) throw error;
    throw new IngestRequestError(400, "invalid_compression", "could not decompress envelope");
  }
  if (decoded.length > maxBytes)
    throw new IngestRequestError(413, "envelope_too_large", "envelope exceeds maximum size");
  return decoded;
}

function extractDsn(
  header: Record<string, unknown>,
): { publicKey: string; sentryProjectId: string } | null {
  if (typeof header.dsn !== "string") return null;
  try {
    const dsn = new URL(header.dsn);
    const segments = dsn.pathname.split("/").filter(Boolean);
    const sentryProjectId = segments.at(-1);
    if (!dsn.username || !sentryProjectId || !/^\d+$/.test(sentryProjectId)) {
      throw new Error("invalid DSN");
    }
    return { publicKey: decodeURIComponent(dsn.username), sentryProjectId };
  } catch {
    throw new IngestRequestError(400, "invalid_dsn", "invalid envelope DSN");
  }
}

function mergeCredentials(
  requestKey: string | undefined,
  envelopeKey: string | undefined,
): string | null {
  if (requestKey && envelopeKey && requestKey !== envelopeKey) {
    throw new IngestRequestError(403, "conflicting_auth", "conflicting Sentry public keys");
  }
  return requestKey ?? envelopeKey ?? null;
}

function parseSentAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function serializeEnvelope(header: Record<string, unknown>, items: PreparedItem[]): Buffer {
  const lines = [JSON.stringify(header)];
  for (const item of items) {
    lines.push(JSON.stringify(item.header));
    if (item.payload) lines.push(item.payload.toString("utf8"));
  }
  return Buffer.from(`${lines.join("\n")}\n`);
}
