const TRACE_ID = /^[0-9a-f]{32}$/i;
const SPAN_ID = /^[0-9a-f]{16}$/i;
const MAX_ATTRIBUTES = 100;
const MAX_CONTAINER_ITEMS = 1_000;
const MAX_TRANSACTION_SPANS = 1_000;

export class TelemetryValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TelemetryValidationError";
  }
}

export function validateTelemetryItem(
  type: "transaction" | "span" | "trace_metric",
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  switch (type) {
    case "transaction":
      validateTransaction(payload);
      return;
    case "span":
      validateSpanItem(header, payload);
      return;
    case "trace_metric":
      validateMetricContainer(header, payload);
  }
}

function validateTransaction(payload: Record<string, unknown>): void {
  requireOptionalHex(payload.event_id, TRACE_ID, "transaction event_id");
  requireFinite(payload.start_timestamp, "transaction start_timestamp");
  requireFinite(payload.timestamp, "transaction timestamp");
  if ((payload.timestamp as number) < (payload.start_timestamp as number)) {
    throw new TelemetryValidationError("transaction timestamp precedes start_timestamp");
  }
  const contexts = record(payload.contexts, "transaction contexts");
  const trace = record(contexts.trace, "transaction trace context");
  requireHex(trace.trace_id, TRACE_ID, "transaction trace_id");
  requireHex(trace.span_id, SPAN_ID, "transaction span_id");
  requireOptionalHex(trace.parent_span_id, SPAN_ID, "transaction parent_span_id");
  if (payload.spans !== undefined) {
    if (!Array.isArray(payload.spans) || payload.spans.length > MAX_TRANSACTION_SPANS) {
      throw new TelemetryValidationError("transaction spans must be a bounded array");
    }
    payload.spans.forEach((span, index) => validateLegacySpan(record(span, `span ${index}`)));
  }
}

function validateSpanItem(header: Record<string, unknown>, payload: Record<string, unknown>): void {
  if (header.content_type === "application/vnd.sentry.items.span.v2+json") {
    validateContainerHeader(header, payload);
    const items = payload.items as unknown[];
    items.forEach((span, index) => validateStreamedSpan(record(span, `streamed span ${index}`)));
    return;
  }
  validateLegacySpan(payload);
}

function validateLegacySpan(span: Record<string, unknown>): void {
  requireHex(span.trace_id, TRACE_ID, "span trace_id");
  requireHex(span.span_id, SPAN_ID, "span span_id");
  requireOptionalHex(span.parent_span_id, SPAN_ID, "span parent_span_id");
  requireFinite(span.start_timestamp, "span start_timestamp");
  requireFinite(span.timestamp, "span timestamp");
  if ((span.timestamp as number) < (span.start_timestamp as number)) {
    throw new TelemetryValidationError("span timestamp precedes start_timestamp");
  }
  if (span.data !== undefined) validateRawAttributes(span.data, "span data");
}

function validateStreamedSpan(span: Record<string, unknown>): void {
  requireHex(span.trace_id, TRACE_ID, "streamed span trace_id");
  requireHex(span.span_id, SPAN_ID, "streamed span span_id");
  requireOptionalHex(span.parent_span_id, SPAN_ID, "streamed span parent_span_id");
  requireString(span.name, "streamed span name", 500);
  requireFinite(span.start_timestamp, "streamed span start_timestamp");
  requireFinite(span.end_timestamp, "streamed span end_timestamp");
  if ((span.end_timestamp as number) < (span.start_timestamp as number)) {
    throw new TelemetryValidationError("streamed span end_timestamp precedes start_timestamp");
  }
  if (span.attributes !== undefined) validateTypedAttributes(span.attributes, "span attributes");
}

function validateMetricContainer(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  validateContainerHeader(header, payload);
  if (payload.version !== 2) throw new TelemetryValidationError("trace_metric version must be 2");
  const items = payload.items as unknown[];
  items.forEach((value, index) => {
    const metric = record(value, `metric ${index}`);
    requireFinite(metric.timestamp, "metric timestamp");
    requireString(metric.name, "metric name", 200);
    if (!(["counter", "gauge", "distribution"] as unknown[]).includes(metric.type)) {
      throw new TelemetryValidationError("metric type is unsupported");
    }
    requireFinite(metric.value, "metric value");
    if (metric.unit !== undefined) requireString(metric.unit, "metric unit", 64);
    if (metric.trace_id !== "") requireHex(metric.trace_id, TRACE_ID, "metric trace_id");
    requireOptionalHex(metric.span_id, SPAN_ID, "metric span_id");
    if (metric.attributes !== undefined)
      validateTypedAttributes(metric.attributes, "metric attributes");
  });
}

function validateContainerHeader(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  if (!Array.isArray(payload.items) || payload.items.length > MAX_CONTAINER_ITEMS) {
    throw new TelemetryValidationError("telemetry container items must be a bounded array");
  }
  if (
    typeof header.item_count !== "number" ||
    !Number.isSafeInteger(header.item_count) ||
    header.item_count !== payload.items.length
  ) {
    throw new TelemetryValidationError("telemetry item_count does not match items length");
  }
}

function validateTypedAttributes(value: unknown, label: string): void {
  const attributes = record(value, label);
  if (Object.keys(attributes).length > MAX_ATTRIBUTES) {
    throw new TelemetryValidationError(`${label} exceeds maximum attribute count`);
  }
  for (const [key, raw] of Object.entries(attributes)) {
    requireString(key, `${label} key`, 200);
    const attribute = record(raw, `${label}.${key}`);
    const type = attribute.type;
    const item = attribute.value;
    const valid =
      (type === "string" && typeof item === "string") ||
      ((type === "integer" || type === "double") &&
        typeof item === "number" &&
        Number.isFinite(item)) ||
      (type === "boolean" && typeof item === "boolean") ||
      (type === "array" && Array.isArray(item) && item.every(isPrimitive));
    if (!valid) throw new TelemetryValidationError(`${label}.${key} has an invalid typed value`);
    if (attribute.unit !== undefined) requireString(attribute.unit, `${label}.${key} unit`, 64);
  }
}

function validateRawAttributes(value: unknown, label: string): void {
  const attributes = record(value, label);
  if (Object.keys(attributes).length > MAX_ATTRIBUTES) {
    throw new TelemetryValidationError(`${label} exceeds maximum attribute count`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TelemetryValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TelemetryValidationError(`${label} must be finite`);
  }
}

function requireString(value: unknown, label: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new TelemetryValidationError(`${label} must be a non-empty bounded string`);
  }
}

function requireHex(value: unknown, pattern: RegExp, label: string): asserts value is string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TelemetryValidationError(`${label} is invalid`);
  }
}

function requireOptionalHex(value: unknown, pattern: RegExp, label: string): void {
  if (value !== undefined && value !== null) requireHex(value, pattern, label);
}

function isPrimitive(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
