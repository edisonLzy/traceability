import type { NormalizedSpan } from "./types.js";

export function normalizeTransaction(payload: Record<string, unknown>): NormalizedSpan[] {
  const contexts = asRecord(payload.contexts);
  const trace = asRecord(contexts.trace);
  const release = stringOrNull(payload.release);
  const environment = stringOrNull(payload.environment);
  const root = legacySpan(
    {
      ...trace,
      description:
        typeof payload.transaction === "string" ? payload.transaction : "<unlabeled transaction>",
      start_timestamp: payload.start_timestamp,
      timestamp: payload.timestamp,
      measurements: payload.measurements,
      is_segment: true,
    },
    release,
    environment,
  );
  const children = Array.isArray(payload.spans)
    ? payload.spans.map((span) => legacySpan(asRecord(span), release, environment))
    : [];
  return [root, ...children];
}

export function normalizeSpanItem(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): NormalizedSpan[] {
  if (header.content_type === "application/vnd.sentry.items.span.v2+json") {
    return (payload.items as unknown[]).map((span) => streamedSpan(asRecord(span)));
  }
  return [legacySpan(payload, null, null)];
}

function legacySpan(
  span: Record<string, unknown>,
  release: string | null,
  environment: string | null,
): NormalizedSpan {
  const start = span.start_timestamp as number;
  const end = span.timestamp as number;
  const attributes = asOptionalRecord(span.data) ?? {};
  return {
    traceId: span.trace_id as string,
    spanId: span.span_id as string,
    parentSpanId: stringOrNull(span.parent_span_id),
    name: typeof span.description === "string" ? span.description : "<unlabeled span>",
    op: stringOrNull(span.op),
    status: stringOrNull(span.status),
    isSegment: span.is_segment === true,
    startTimestamp: new Date(start * 1_000),
    endTimestamp: new Date(end * 1_000),
    durationMs: (end - start) * 1_000,
    release,
    environment,
    attributes,
    measurements: asOptionalRecord(span.measurements),
  };
}

function streamedSpan(span: Record<string, unknown>): NormalizedSpan {
  const start = span.start_timestamp as number;
  const end = span.end_timestamp as number;
  const attributes = asOptionalRecord(span.attributes) ?? {};
  return {
    traceId: span.trace_id as string,
    spanId: span.span_id as string,
    parentSpanId: stringOrNull(span.parent_span_id),
    name: span.name as string,
    op: typedStringAttribute(attributes["sentry.op"]),
    status: stringOrNull(span.status),
    isSegment: span.is_segment === true,
    startTimestamp: new Date(start * 1_000),
    endTimestamp: new Date(end * 1_000),
    durationMs: (end - start) * 1_000,
    release: typedStringAttribute(attributes["sentry.release"]),
    environment: typedStringAttribute(attributes["sentry.environment"]),
    attributes,
    measurements: null,
  };
}

function typedStringAttribute(value: unknown): string | null {
  const attribute = asOptionalRecord(value);
  return attribute?.type === "string" && typeof attribute.value === "string"
    ? attribute.value
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
