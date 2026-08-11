import { createHash } from "node:crypto";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

import type { ParsedEnvelope, ParsedEnvelopeItem } from "./envelope-parser.js";
import { EnvelopeParseError, parseEnvelope } from "./envelope-parser.js";
import {
  NoopIngestionRateLimiter,
  RedisIngestionRateLimiter,
  type IngestionRateLimiter,
} from "./rate-limiter.js";
import type { IngestRepository, PreparedItem } from "./repository.js";
import { parseAndScrubEvent, scrubValue } from "./scrubber.js";
import { validateTelemetryItem } from "./telemetry-validator.js";

export interface IngestLimits {
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxItems: number;
  maxItemBytes: number;
  replayMaxRecordingBytes: number;
  minidumpMaxBytes: number;
}

export interface ProjectKeyLookup {
  findIngestProject(
    sentryProjectId: string,
    publicKey: string,
  ): Promise<{
    projectId: string;
    projectKeyId: string;
    allowedOrigins: string[];
    enabledItemTypes: string[];
    rateLimitPerSecond: number;
  } | null>;
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

export class IngestService {
  /** Override in tests to mock rate limiting without Redis. */
  public rateLimiter: IngestionRateLimiter;

  public constructor(
    private readonly repository: IngestRepository,
    private readonly projectKeyLookup: ProjectKeyLookup,
    private readonly limits: IngestLimits,
    redisUrl: string,
  ) {
    this.rateLimiter = redisUrl
      ? new RedisIngestionRateLimiter(redisUrl)
      : new NoopIngestionRateLimiter();
  }

  /** Exposed for readiness health checks. */
  checkRateLimiter(): Promise<void> {
    return this.rateLimiter.check();
  }

  async ingest(input: {
    pathProjectId: string;
    body: Buffer;
    contentEncoding?: string;
    origin?: string;
    userAgent?: string;
    clientIp: string;
    publicKey?: string;
  }) {
    const maxEnvelopeBytes = Math.max(
      this.limits.maxDecompressedBytes,
      this.limits.minidumpMaxBytes + this.limits.maxItemBytes,
    );
    const body = decompress(input.body, input.contentEncoding, maxEnvelopeBytes);
    let envelope: ParsedEnvelope;
    try {
      envelope = parseEnvelope(body, {
        ...this.limits,
        maxMinidumpBytes: this.limits.minidumpMaxBytes,
      });
    } catch (error) {
      if (error instanceof EnvelopeParseError) {
        throw new IngestRequestError(400, "invalid_envelope", error.message);
      }
      throw error;
    }
    if (
      input.body.byteLength > this.limits.maxCompressedBytes &&
      !envelope.items.some(
        (item) => item.type === "attachment" && item.header.attachment_type === "event.minidump",
      )
    ) {
      throw new IngestRequestError(
        413,
        "envelope_too_large",
        "envelope exceeds maximum compressed size",
      );
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

    const project = await this.projectKeyLookup.findIngestProject(input.pathProjectId, credentials);
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

    const preparedItems = envelope.items.map((item) =>
      prepareItem(
        item,
        project.enabledItemTypes,
        this.limits.replayMaxRecordingBytes,
        this.limits.minidumpMaxBytes,
        typeof envelope.header.event_id === "string" ? envelope.header.event_id : null,
      ),
    );
    const sanitizedEnvelope = serializeEnvelope(
      scrubValue(envelope.header) as Record<string, unknown>,
      preparedItems,
    );
    const checksum = createHash("sha256").update(sanitizedEnvelope).digest("hex");

    const result = await this.repository.persist({
      project,
      sentAt: parseSentAt(envelope.header.sent_at),
      origin: input.origin,
      userAgent: input.userAgent,
      checksum,
      sanitizedEnvelope,
      items: preparedItems,
    });

    const event = result.items.find((item) => item.type === "event" && item.status === "pending");
    return { eventId: event?.eventId, envelopeId: result.envelope.id };
  }
}

function prepareItem(
  item: ParsedEnvelopeItem,
  enabledItemTypes: string[],
  replayMaxRecordingBytes: number,
  minidumpMaxBytes: number,
  envelopeEventId: string | null,
): PreparedItem {
  const header = scrubValue(item.header) as Record<string, unknown>;

  if (item.type === "attachment" && item.header.attachment_type === "event.minidump") {
    if (!enabledItemTypes.includes("attachment")) {
      return ignoredItem(item, header, "unsupported_item");
    }
    if (item.payload.byteLength > minidumpMaxBytes) {
      return ignoredItem(item, header, "payload_too_large");
    }
    if (!isMinidump(item.payload)) {
      return ignoredItem(item, header, "invalid_minidump");
    }
    return {
      sequence: item.sequence,
      type: item.type,
      header,
      payload: item.payload,
      payloadJson: null,
      eventId: envelopeEventId,
      status: "pending",
      errorCode: null,
    };
  }

  // replay_recording: binary payload
  if (item.type === "replay_recording" && enabledItemTypes.includes("replay_recording")) {
    if (item.payload.byteLength > replayMaxRecordingBytes) {
      return {
        sequence: item.sequence,
        type: item.type,
        header,
        payload: null,
        payloadJson: null,
        eventId: null,
        status: "ignored",
        errorCode: "payload_too_large",
      };
    }
    return {
      sequence: item.sequence,
      type: item.type,
      header,
      payload: item.payload,
      payloadJson: null,
      eventId: null,
      status: "pending",
      errorCode: null,
    };
  }

  // replay_event: JSON metadata payload
  if (item.type === "replay_event" && enabledItemTypes.includes("replay_event")) {
    try {
      const payloadJson = parseAndScrubEvent(item.payload);
      const replayId = typeof payloadJson.replay_id === "string" ? payloadJson.replay_id : null;
      return {
        sequence: item.sequence,
        type: item.type,
        header,
        payload: Buffer.from(JSON.stringify(payloadJson)),
        payloadJson,
        eventId: replayId,
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
        errorCode: "invalid_replay_event_json",
      };
    }
  }

  if (
    (item.type === "transaction" || item.type === "span" || item.type === "trace_metric") &&
    enabledItemTypes.includes(item.type)
  ) {
    try {
      const payloadJson = parseAndScrubEvent(item.payload);
      validateTelemetryItem(item.type, header, payloadJson);
      const eventId =
        item.type === "transaction" && typeof payloadJson.event_id === "string"
          ? payloadJson.event_id
          : null;
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
        errorCode: `invalid_${item.type}_json`,
      };
    }
  }

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
    if (item.type === "attachment") {
      lines.push(
        JSON.stringify({
          ...item.header,
          length: 0,
          traceability_payload_omitted: true,
        }),
      );
      lines.push("");
      continue;
    }
    lines.push(JSON.stringify(item.header));
    if (item.payload) lines.push(item.payload.toString("utf8"));
  }
  return Buffer.from(`${lines.join("\n")}\n`);
}

function ignoredItem(
  item: ParsedEnvelopeItem,
  header: Record<string, unknown>,
  errorCode: string,
): PreparedItem {
  return {
    sequence: item.sequence,
    type: item.type,
    header,
    payload: null,
    payloadJson: null,
    eventId: null,
    status: "ignored",
    errorCode,
  };
}

function isMinidump(payload: Buffer): boolean {
  return payload.byteLength >= 10 * 1024 && payload.subarray(0, 4).toString("ascii") === "MDMP";
}
