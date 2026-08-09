export type SymbolicatedStatus = "full" | "partial" | "none" | "unavailable";

export interface ExceptionValue {
  type: string;
  value: string;
  mechanism: string | null;
}

export interface SourceContext {
  lines: string[];
  startLine: number;
  errorLine: number;
}

export interface StackFrame {
  id: string;
  file: string;
  functionName: string;
  line: number | null;
  column: number | null;
  resolved: boolean;
  context: SourceContext | null;
  generated: {
    file: string;
    line: number | null;
    column: number | null;
  } | null;
}

export interface BreadcrumbData {
  id: string;
  category: string;
  type: string | null;
  message: string | null;
  level: string | null;
  timestamp: string | number | null;
  data: string | null;
}

export interface DisplayRow {
  key: string;
  value: string;
}

export interface ContextGroup {
  title: string;
  rows: DisplayRow[];
  tags?: string[];
}

export interface EventTraceMeta {
  traceId?: string | null;
  spanId?: string | null;
}

export function readExceptionValues(payload: Record<string, unknown>): ExceptionValue[] {
  const values = exceptionRecords(payload);
  return values.map((value) => {
    const mechanism = asRecord(value.mechanism);
    const mechanismParts = [
      readString(mechanism?.type),
      typeof mechanism?.handled === "boolean" ? `handled: ${String(mechanism.handled)}` : null,
      typeof mechanism?.synthetic === "boolean"
        ? `synthetic: ${String(mechanism.synthetic)}`
        : null,
    ].filter((part): part is string => Boolean(part));

    return {
      type: readString(value.type) ?? "Error",
      value: readString(value.value) ?? "No exception message captured.",
      mechanism: mechanismParts.length > 0 ? mechanismParts.join(" · ") : null,
    };
  });
}

export function readStackFrames(payload: Record<string, unknown>): StackFrame[] {
  const frames: StackFrame[] = [];

  exceptionRecords(payload).forEach((exception, exceptionIndex) => {
    const stacktrace = asRecord(exception.stacktrace);
    const rawFrames = Array.isArray(stacktrace?.frames) ? stacktrace.frames : [];
    rawFrames.forEach((rawFrame, frameIndex) => {
      const frame = asRecord(rawFrame);
      if (!frame) return;

      const data = asRecord(frame.data);
      const resolved = data?.symbolicated === true;
      const line = readNumber(frame.lineno);
      const rawFilename = readString(data?.raw_filename);
      const rawLine = readNumber(data?.raw_lineno);
      const rawColumn = readNumber(data?.raw_colno);

      frames.push({
        id: `${exceptionIndex}-${frameIndex}`,
        file: readString(frame.filename) ?? "<unknown source>",
        functionName: readString(frame.function) ?? "<anonymous>",
        line,
        column: readNumber(frame.colno),
        resolved,
        context: readSourceContext(frame, data, resolved, line),
        generated:
          resolved && rawFilename ? { file: rawFilename, line: rawLine, column: rawColumn } : null,
      });
    });
  });

  // Sentry frames are ordered outermost → innermost. Put the throw site first.
  return frames.reverse();
}

export function readSymbolicationStatus(
  payload: Record<string, unknown>,
): SymbolicatedStatus | undefined {
  const value = payload.symbolicated;
  return value === "full" || value === "partial" || value === "none" || value === "unavailable"
    ? value
    : undefined;
}

export function readBreadcrumbs(payload: Record<string, unknown>): BreadcrumbData[] {
  const breadcrumbContainer = payload.breadcrumbs;
  const rawValues = Array.isArray(breadcrumbContainer)
    ? breadcrumbContainer
    : Array.isArray(asRecord(breadcrumbContainer)?.values)
      ? (asRecord(breadcrumbContainer)!.values as unknown[])
      : [];

  return rawValues.flatMap((rawValue, index) => {
    const value = asRecord(rawValue);
    if (!value) return [];
    return [
      {
        id: `${index}-${readString(value.timestamp) ?? readNumber(value.timestamp) ?? "unknown"}`,
        category: readString(value.category) ?? readString(value.type) ?? "event",
        type: readString(value.type) ?? null,
        message: readString(value.message) ?? null,
        level: readString(value.level) ?? null,
        timestamp: readTimestamp(value.timestamp),
        data: value.data === undefined ? null : formatDisplayValue(value.data),
      },
    ];
  });
}

export function buildEventContext(
  payload: Record<string, unknown>,
  traceMeta: EventTraceMeta = {},
): ContextGroup[] {
  const contexts = asRecord(payload.contexts) ?? {};
  const runtimeKeys = ["runtime", "browser", "os", "device", "culture", "app"];
  const runtimeRows = runtimeKeys.flatMap((key) => rowsFromValue(contexts[key], key));
  const traceRows = rowsFromValue(contexts.trace);
  addMissingRow(traceRows, "trace_id", traceMeta.traceId);
  addMissingRow(traceRows, "span_id", traceMeta.spanId);

  const tags = tagValues(payload.tags);
  const groups: ContextGroup[] = [
    { title: "Request", rows: rowsFromValue(payload.request) },
    { title: "Runtime", rows: runtimeRows },
    { title: "Trace", rows: traceRows },
    { title: "Tags", rows: [], tags },
    { title: "Extra", rows: rowsFromValue(payload.extra) },
  ];

  const userRows = rowsFromValue(payload.user);
  if (userRows.length > 0) groups.push({ title: "User", rows: userRows });

  const sdkRows = rowsFromValue(payload.sdk);
  if (sdkRows.length > 0) groups.push({ title: "SDK", rows: sdkRows });

  const handledContexts = new Set([...runtimeKeys, "trace"]);
  const additionalRows = Object.entries(contexts).flatMap(([key, value]) =>
    handledContexts.has(key) ? [] : rowsFromValue(value, key),
  );
  if (additionalRows.length > 0) {
    groups.push({ title: "Additional contexts", rows: additionalRows });
  }

  return groups;
}

export function formatDisplayValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function shortId(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function exceptionRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
  const exception = asRecord(payload.exception);
  if (!Array.isArray(exception?.values)) return [];
  return exception.values.flatMap((value) => {
    const record = asRecord(value);
    return record ? [record] : [];
  });
}

function readSourceContext(
  frame: Record<string, unknown>,
  data: Record<string, unknown> | null,
  resolved: boolean,
  line: number | null,
): SourceContext | null {
  // Resolved frames must carry the worker's explicit sourcemap marker. Older
  // rows may still contain SDK context for the generated bundle.
  if (resolved && data?.source_context !== "sourcemap") return null;

  const before = stringArray(frame.pre_context);
  const contextLine = typeof frame.context_line === "string" ? frame.context_line : null;
  const after = stringArray(frame.post_context);
  if (contextLine === null) return null;

  const errorLine = line ?? before.length + 1;
  return {
    lines: [...before, contextLine, ...after],
    startLine: Math.max(1, errorLine - before.length),
    errorLine,
  };
}

function rowsFromValue(value: unknown, prefix?: string): DisplayRow[] {
  const record = asRecord(value);
  if (!record) {
    return value === undefined
      ? []
      : [{ key: prefix ?? "value", value: formatDisplayValue(value) }];
  }
  return Object.entries(record).map(([key, entry]) => ({
    key: prefix ? `${prefix}.${key}` : key,
    value: formatDisplayValue(entry),
  }));
}

function tagValues(value: unknown): string[] {
  const record = asRecord(value);
  if (record) {
    return Object.entries(record).map(([key, entry]) => `${key}: ${formatDisplayValue(entry)}`);
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== "string") return [];
    return [`${entry[0]}: ${formatDisplayValue(entry[1])}`];
  });
}

function addMissingRow(rows: DisplayRow[], key: string, value: string | null | undefined): void {
  if (!value || rows.some((row) => row.key === key)) return;
  rows.push({ key, value });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTimestamp(value: unknown): string | number | null {
  if (typeof value === "string" && value.length > 0) return value;
  return readNumber(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
