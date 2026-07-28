import { createHash } from "node:crypto";

import type { ProcessingRepository } from "./repository.js";
import type { EventFields } from "./types.js";

export class ProcessingService {
  public constructor(private readonly repository: ProcessingRepository) {}

  listFailures(limit = 100) {
    return this.repository.listFailures(limit);
  }

  processEventItem(itemId: string): Promise<void> {
    return this.repository.processEventItem(itemId, deriveEventFields);
  }

  recordFailure(input: {
    itemId: string;
    stage: string;
    message: string;
    attempts: number;
  }): Promise<void> {
    return this.repository.recordFailure(input);
  }
}

function deriveEventFields(payload: Record<string, unknown>, receivedAt: Date): EventFields {
  const exception = firstException(payload);
  const type = exception?.type ?? "Error";
  const message = exception?.value ?? stringValue(payload.message) ?? "Unhandled event";
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

  return {
    fingerprint,
    title: `${type}: ${message}`.slice(0, 500),
    type: "error",
    timestamp: eventTimestamp(payload.timestamp, receivedAt),
    release: stringValue(payload.release),
    environment: stringValue(payload.environment),
    level: stringValue(payload.level),
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
