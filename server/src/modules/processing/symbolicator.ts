import { SourceMapConsumer, type RawSourceMap } from "source-map";

/**
 * Loads a source map for a given `debug_id`, returning null when the artifact
 * isn't known. Worker code injects a bound `SourcemapService.findMapBody`;
 * tests pass an in-memory implementation.
 */
export type SourcemapResolver = (debugId: string) => Promise<Buffer | null>;

export type SymbolicationOutcome = "full" | "partial" | "none" | "unavailable";

interface Frame extends Record<string, unknown> {
  debug_id?: unknown;
  filename?: unknown;
  function?: unknown;
  lineno?: unknown;
  colno?: unknown;
  data?: Record<string, unknown>;
}

interface DebugMetaImage {
  type: unknown;
  code_file: unknown;
  debug_id: unknown;
}

/**
 * Rewrites `payload.exception.values[*].stacktrace.frames` in place using
 * whichever source-map lookup path is available on the payload.
 *
 * Two resolution paths, tried in order per frame:
 *
 *  1. `frame.debug_id` directly on the frame (Sentry's older shape, and how
 *     hand-crafted fixtures address a map).
 *  2. `frame.filename` looked up against `event.debug_meta.images[]` — the
 *     stock `@sentry/browser` (v8+) shape: `applyDebugMeta` hoists per-frame
 *     debug_ids off the frames and into `debug_meta.images = [{ type:
 *     "sourcemap", code_file, debug_id }, ...]`.
 *
 * Frames without a match are left as-is. Also stamps `payload.symbolicated`
 * with one of:
 *   - "full"        every frame we tried to resolve was resolved
 *   - "partial"     at least one frame resolved, at least one did not
 *   - "none"        we knew of a debug_id for zero frames, OR none resolved
 *   - "unavailable" the resolver threw for every debug_id we tried
 *
 * Best-effort: per-debug_id resolver failures are caught and treated as a
 * miss for the frames that depended on that debug_id, so a transient blob-
 * storage error can't block an event from persisting.
 */
export async function symbolicatePayload(
  payload: Record<string, unknown>,
  resolveMap: SourcemapResolver,
): Promise<SymbolicationOutcome> {
  const frames = collectFrames(payload);
  if (frames.length === 0) {
    // Nothing to do; leave payload untouched but signal "none" so downstream
    // knows the pass ran.
    payload.symbolicated = "none";
    return "none";
  }

  const codeFileToDebugId = collectDebugMetaImages(payload);

  // Group frames by debug_id so each map is loaded at most once per call.
  const framesByDebugId = new Map<string, Frame[]>();
  for (const frame of frames) {
    const debugId = resolveDebugIdForFrame(frame, codeFileToDebugId);
    if (!debugId) continue;
    const bucket = framesByDebugId.get(debugId);
    if (bucket) bucket.push(frame);
    else framesByDebugId.set(debugId, [frame]);
  }

  if (framesByDebugId.size === 0) {
    payload.symbolicated = "none";
    return "none";
  }

  let resolved = 0;
  let attempted = 0;
  let resolverErrors = 0;
  for (const [debugId, group] of framesByDebugId) {
    attempted += group.length;
    let body: Buffer | null;
    try {
      body = await resolveMap(debugId);
    } catch {
      resolverErrors += group.length;
      continue;
    }
    if (!body) continue;

    let raw: RawSourceMap;
    try {
      raw = JSON.parse(body.toString("utf8")) as RawSourceMap;
    } catch {
      continue;
    }

    const consumer = await new SourceMapConsumer(raw);
    try {
      for (const frame of group) {
        if (applyPositionToFrame(frame, consumer)) resolved += 1;
      }
    } finally {
      consumer.destroy();
    }
  }

  const totalWithDebugId = attempted;
  const outcome: SymbolicationOutcome =
    resolverErrors === totalWithDebugId && totalWithDebugId > 0
      ? "unavailable"
      : resolved === 0
        ? "none"
        : resolved === totalWithDebugId
          ? "full"
          : "partial";
  payload.symbolicated = outcome;
  return outcome;
}

/**
 * Build `code_file → debug_id` from `payload.debug_meta.images[]`, keeping
 * only sourcemap-type entries. Returns an empty map on any shape mismatch;
 * callers just get no debug_meta lookups in that case.
 */
function collectDebugMetaImages(payload: Record<string, unknown>): Map<string, string> {
  const debugMeta = payload.debug_meta;
  if (!debugMeta || typeof debugMeta !== "object" || Array.isArray(debugMeta)) return new Map();
  const images = (debugMeta as { images?: unknown }).images;
  if (!Array.isArray(images)) return new Map();

  const out = new Map<string, string>();
  for (const image of images as DebugMetaImage[]) {
    if (!image || typeof image !== "object") continue;
    if (image.type !== "sourcemap") continue;
    if (typeof image.code_file !== "string" || typeof image.debug_id !== "string") continue;
    if (!image.code_file || !image.debug_id) continue;
    out.set(image.code_file, image.debug_id);
  }
  return out;
}

function resolveDebugIdForFrame(
  frame: Frame,
  codeFileToDebugId: Map<string, string>,
): string | undefined {
  if (typeof frame.debug_id === "string" && frame.debug_id) return frame.debug_id;
  if (typeof frame.filename === "string" && frame.filename) {
    const hit = codeFileToDebugId.get(frame.filename);
    if (hit) return hit;
  }
  return undefined;
}

function collectFrames(payload: Record<string, unknown>): Frame[] {
  const exception = payload.exception;
  if (!exception || typeof exception !== "object" || Array.isArray(exception)) return [];
  const values = (exception as { values?: unknown }).values;
  if (!Array.isArray(values)) return [];
  const out: Frame[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const stacktrace = (value as { stacktrace?: unknown }).stacktrace;
    if (!stacktrace || typeof stacktrace !== "object" || Array.isArray(stacktrace)) continue;
    const frames = (stacktrace as { frames?: unknown }).frames;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      if (frame && typeof frame === "object" && !Array.isArray(frame)) {
        out.push(frame as Frame);
      }
    }
  }
  return out;
}

function applyPositionToFrame(frame: Frame, consumer: SourceMapConsumer): boolean {
  const line = numberValue(frame.lineno);
  const column = numberValue(frame.colno);
  if (line === undefined || column === undefined) return false;
  const original = consumer.originalPositionFor({ line, column });
  if (original.source === null || original.line === null) return false;

  const data: Record<string, unknown> = { ...(frame.data ?? {}) };
  data.raw_filename = frame.filename;
  data.raw_function = frame.function;
  data.raw_lineno = frame.lineno;
  data.raw_colno = frame.colno;
  data.symbolicated = true;
  frame.data = data;

  frame.filename = original.source;
  if (original.name != null) frame.function = original.name;
  frame.lineno = original.line;
  if (original.column != null) frame.colno = original.column;
  return true;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
