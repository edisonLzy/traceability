import { cn } from "@renderer/lib/utils";
import type { ReactElement } from "react";

import { SourceLocation, type SourceLocationData } from "./SourceLocation";

/** Values written by the worker's symbolicator (see server/src/modules/processing/symbolicator.ts). */
type SymbolicatedStatus = "full" | "partial" | "none" | "unavailable";

interface Frame {
  filename?: unknown;
  function?: unknown;
  lineno?: unknown;
  colno?: unknown;
  data?: unknown;
}

interface StacktraceProps {
  payload: Record<string, unknown>;
}

/**
 * Renders a formatted stack trace for an event's `exception.values[0]`. Every
 * frame is displayed through `SourceLocation`, which already handles the
 * "resolved" appearance. Order is reversed so the innermost frame — where the
 * throw happened — sits at the top, matching Chrome DevTools / Sentry.
 *
 * Returns `null` when the payload doesn't carry a stack (message-only events,
 * white-screen captures, etc.) so callers can decide how to fall back.
 */
export function Stacktrace({ payload }: StacktraceProps): ReactElement | null {
  const exceptionValue = firstExceptionValue(payload);
  const rawFrames = readFrames(exceptionValue);
  if (rawFrames.length === 0) return null;

  const status = readStatus(payload);
  const exceptionType = readString(exceptionValue?.type);
  const exceptionMessage = readString(exceptionValue?.value);

  // Sentry ships frames in call order (outermost → innermost). Reverse for a
  // DevTools-style display without mutating the original array.
  const frames = [...rawFrames].reverse();

  return (
    <div className="border-b border-hairline last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4.5 py-3">
        <div className="min-w-0">
          {exceptionType || exceptionMessage ? (
            <div className="truncate font-mono text-xs text-ink">
              <span className="font-[630]">{exceptionType ?? "Error"}</span>
              {exceptionMessage ? `: ${exceptionMessage}` : null}
            </div>
          ) : (
            <div className="text-[11px] uppercase tracking-[0.06em] text-tertiary">Stack trace</div>
          )}
        </div>
        <SymbolicationBadge status={status} />
      </div>
      <div>
        {frames.map((frame, index) => {
          const location = frameToLocation(frame);
          if (!location) return null;
          return <SourceLocation key={index} location={location} />;
        })}
      </div>
    </div>
  );
}

function SymbolicationBadge({ status }: { status: SymbolicatedStatus | undefined }) {
  // Fixed-tone Badge palette is limited; we colour a dot + text ourselves to
  // stay expressive without touching the shared component.
  const config = {
    full: { dot: "bg-success", label: "Symbolicated" },
    partial: { dot: "bg-warning", label: "Partial source map" },
    none: { dot: "bg-subtle", label: "No source map" },
    unavailable: { dot: "bg-danger", label: "Source map unavailable" },
  } satisfies Record<SymbolicatedStatus, { dot: string; label: string }>;

  const entry = status ? config[status] : { dot: "bg-subtle", label: "Raw stack" };
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-hairline bg-overlay px-2 text-[10px] font-[600] text-muted">
      <span className={cn("size-1.5 rounded-full", entry.dot)} />
      {entry.label}
    </span>
  );
}

function firstExceptionValue(payload: Record<string, unknown>): Record<string, unknown> | null {
  const exception = payload.exception;
  if (!exception || typeof exception !== "object" || Array.isArray(exception)) return null;
  const values = (exception as { values?: unknown }).values;
  if (!Array.isArray(values) || values.length === 0) return null;
  const value = values[0];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFrames(exception: Record<string, unknown> | null): Frame[] {
  if (!exception) return [];
  const stacktrace = exception.stacktrace;
  if (!stacktrace || typeof stacktrace !== "object" || Array.isArray(stacktrace)) return [];
  const frames = (stacktrace as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return [];
  return frames.filter(
    (frame): frame is Frame => !!frame && typeof frame === "object" && !Array.isArray(frame),
  );
}

function readStatus(payload: Record<string, unknown>): SymbolicatedStatus | undefined {
  const raw = payload.symbolicated;
  return raw === "full" || raw === "partial" || raw === "none" || raw === "unavailable"
    ? raw
    : undefined;
}

/**
 * Turn a Sentry stack frame into the shape SourceLocation renders. When the
 * frame carries the worker's `data.raw_*` fields we split the display into a
 * resolved location + a "Generated" trailer showing the minified position;
 * otherwise we just show whatever the SDK sent.
 */
function frameToLocation(frame: Frame): SourceLocationData | null {
  const filename = readString(frame.filename);
  const line = readNumber(frame.lineno);
  const column = readNumber(frame.colno);
  if (!filename || line === undefined || column === undefined) return null;

  const location: SourceLocationData = {
    file: filename,
    line,
    column,
    ...(readString(frame.function) !== undefined ? { function: readString(frame.function)! } : {}),
  };

  const data = frame.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const rec = data as Record<string, unknown>;
    if (rec.symbolicated === true) {
      const rawFilename = readString(rec.raw_filename);
      const rawLine = readNumber(rec.raw_lineno);
      const rawColumn = readNumber(rec.raw_colno);
      if (rawFilename && rawLine !== undefined && rawColumn !== undefined) {
        location.generated = { file: rawFilename, line: rawLine, column: rawColumn };
      }
    }
  }

  return location;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
