import { createHash } from "node:crypto";

import type { SourcemapService } from "../sourcemaps/service.js";
import type { ProcessingRepository } from "./repository.js";
import { symbolicatePayload, type SourcemapResolver } from "./symbolicator.js";
import type { EventFields } from "./types.js";

export class ProcessingService {
  public constructor(
    private readonly repository: ProcessingRepository,
    private readonly sourcemaps?: SourcemapService,
  ) {}

  listFailures(limit = 100) {
    return this.repository.listFailures(limit);
  }

  processEventItem(itemId: string): Promise<void> {
    return this.repository.processEventItem(itemId, deriveEventFields, this.buildSymbolicate());
  }

  recordFailure(input: {
    itemId: string;
    stage: string;
    message: string;
    attempts: number;
  }): Promise<void> {
    return this.repository.recordFailure(input);
  }

  private buildSymbolicate() {
    const sourcemaps = this.sourcemaps;
    if (!sourcemaps) return undefined;
    return async (payload: Record<string, unknown>, projectId: string): Promise<void> => {
      const resolver: SourcemapResolver = (debugId) => sourcemaps.findMapBody(projectId, debugId);
      await symbolicatePayload(payload, resolver);
    };
  }
}

function deriveEventFields(payload: Record<string, unknown>, receivedAt: Date): EventFields {
  const exception = firstException(payload);
  const nativeCrash = payload.platform === "native";
  const nativeProcess = tagValue(payload, "event.process") ?? "unknown";
  const exitReason = tagValue(payload, "exit.reason");
  const type = exception?.type ?? (nativeCrash ? "NativeCrash" : "Error");
  const message =
    exception?.value ??
    stringValue(payload.message) ??
    (nativeCrash
      ? `${nativeProcess} process crashed${exitReason ? ` (${exitReason})` : ""}`
      : "Unhandled event");
  const candidateFrames = exception?.stacktrace?.frames;
  const frames = Array.isArray(candidateFrames) ? candidateFrames : [];
  const inAppFrames = frames
    .filter((frame) => frame.in_app !== false)
    .slice(-5)
    .map((frame) => `${frame.filename ?? ""}:${frame.function ?? ""}`)
    .join("|");
  const fingerprint = createHash("sha256")
    .update(`${type}\n${normalizeMessage(message)}\n${inAppFrames}`)
    .digest("hex");
  const trace = traceContext(payload);

  return {
    fingerprint,
    title: `${type}: ${message}`.slice(0, 500),
    type: nativeCrash ? "native_crash" : "error",
    timestamp: eventTimestamp(payload.timestamp, receivedAt),
    release: stringValue(payload.release),
    environment: stringValue(payload.environment),
    level: stringValue(payload.level),
    traceId: trace?.traceId,
    spanId: trace?.spanId,
  };
}

function tagValue(payload: Record<string, unknown>, key: string): string | undefined {
  const tags = payload.tags;
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return undefined;
  return stringValue((tags as Record<string, unknown>)[key]);
}

function traceContext(
  payload: Record<string, unknown>,
): { traceId?: string; spanId?: string } | undefined {
  const contexts = payload.contexts;
  if (!contexts || typeof contexts !== "object" || Array.isArray(contexts)) return undefined;
  const trace = (contexts as Record<string, unknown>).trace;
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return undefined;
  const value = trace as Record<string, unknown>;
  return {
    traceId: stringValue(value.trace_id),
    spanId: stringValue(value.span_id),
  };
}

interface StackFrame {
  filename?: string;
  function?: string;
  in_app?: boolean;
}

interface ExceptionValue {
  type?: string;
  value?: string;
  stacktrace?: { frames?: StackFrame[] };
}

function firstException(payload: Record<string, unknown>): ExceptionValue | undefined {
  const exception = payload.exception;
  if (!exception || typeof exception !== "object" || Array.isArray(exception)) return undefined;
  const values = (exception as { values?: unknown }).values;
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const value = values[0];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ExceptionValue)
    : undefined;
}

function eventTimestamp(value: unknown, fallback: Date): Date {
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "string") {
    const timestamp = new Date(value);
    if (!Number.isNaN(timestamp.valueOf())) return timestamp;
  }
  return fallback;
}

function normalizeMessage(message: string): string {
  return message
    .replace(/\b\d+\b/g, "#")
    .replace(/\b[0-9a-f]{8,}\b/gi, "#")
    .slice(0, 500);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
