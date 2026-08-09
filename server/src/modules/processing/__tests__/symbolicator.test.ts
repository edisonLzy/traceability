import { SourceMapGenerator } from "source-map";
import { describe, expect, it } from "vitest";

import { symbolicatePayload, type SourcemapResolver } from "../symbolicator.js";

/**
 * Build a tiny sourcemap where three positions on the (single-line) generated
 * bundle map to three named locations in a fake `src/app.ts`. Returns the raw
 * map JSON as a Buffer, ready for the resolver.
 */
async function buildFixtureMap(fileName = "app.js"): Promise<Buffer> {
  const gen = new SourceMapGenerator({ file: fileName });
  gen.setSourceContent("src/app.ts", "const a = 1;\nconst b = 2;\nconst c = 3;\n");
  // generated col 15 → src/app.ts:1:2  as `first`
  gen.addMapping({
    generated: { line: 1, column: 15 },
    original: { line: 1, column: 2 },
    source: "src/app.ts",
    name: "first",
  });
  // generated col 39 → src/app.ts:2:2  as `second`
  gen.addMapping({
    generated: { line: 1, column: 39 },
    original: { line: 2, column: 2 },
    source: "src/app.ts",
    name: "second",
  });
  // generated col 58 → src/app.ts:3:2  as `third`
  gen.addMapping({
    generated: { line: 1, column: 58 },
    original: { line: 3, column: 2 },
    source: "src/app.ts",
    name: "third",
  });
  return Buffer.from(gen.toString());
}

function buildResolver(entries: Record<string, Buffer>): SourcemapResolver {
  return async (debugId) => entries[debugId] ?? null;
}

interface Frame {
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  debug_id?: string;
  pre_context?: string[];
  context_line?: string;
  post_context?: string[];
  data?: Record<string, unknown>;
}

function buildPayload(input: {
  frames: Frame[];
  debugMetaImages?: Array<{ type: string; code_file: string; debug_id: string }>;
}) {
  const payload: Record<string, unknown> = {
    exception: {
      values: [
        {
          type: "Error",
          value: "boom",
          stacktrace: { frames: input.frames },
        },
      ],
    },
  };
  if (input.debugMetaImages) {
    payload.debug_meta = { images: input.debugMetaImages };
  }
  return payload;
}

describe("symbolicatePayload", () => {
  it("resolves frames when frame.debug_id is set (fixture / legacy shape)", async () => {
    const debugId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const map = await buildFixtureMap();
    const payload = buildPayload({
      frames: [
        { filename: "app.js", function: "x", lineno: 1, colno: 15, debug_id: debugId },
        { filename: "app.js", function: "y", lineno: 1, colno: 39, debug_id: debugId },
        { filename: "app.js", function: "z", lineno: 1, colno: 58, debug_id: debugId },
      ],
    });

    const outcome = await symbolicatePayload(payload, buildResolver({ [debugId]: map }));

    expect(outcome).toBe("full");
    expect(payload.symbolicated).toBe("full");
    const frames = (
      (payload.exception as { values: unknown[] }).values[0] as {
        stacktrace: { frames: Frame[] };
      }
    ).stacktrace.frames;
    expect(frames.map((f) => f.function)).toEqual(["first", "second", "third"]);
    expect(frames.map((f) => f.filename)).toEqual(["src/app.ts", "src/app.ts", "src/app.ts"]);
    expect(frames[0]?.data).toMatchObject({
      raw_filename: "app.js",
      source_context: "sourcemap",
      symbolicated: true,
    });
    expect(frames[1]).toMatchObject({
      pre_context: ["const a = 1;"],
      context_line: "const b = 2;",
      post_context: ["const c = 3;"],
    });
  });

  it("resolves frames via event.debug_meta.images[] (Sentry v8 shape)", async () => {
    const debugId = "11111111-2222-3333-4444-555555555555";
    const map = await buildFixtureMap();
    const payload = buildPayload({
      frames: [
        // NOTE: no debug_id on any frame — the SDK hoisted it into debug_meta.
        { filename: "app.js", function: "x", lineno: 1, colno: 15 },
        { filename: "app.js", function: "y", lineno: 1, colno: 39 },
      ],
      debugMetaImages: [{ type: "sourcemap", code_file: "app.js", debug_id: debugId }],
    });

    const outcome = await symbolicatePayload(payload, buildResolver({ [debugId]: map }));

    expect(outcome).toBe("full");
    const frames = (
      (payload.exception as { values: unknown[] }).values[0] as {
        stacktrace: { frames: Frame[] };
      }
    ).stacktrace.frames;
    expect(frames.map((f) => f.function)).toEqual(["first", "second"]);
  });

  it("prefers frame.debug_id when both sources are present and disagree", async () => {
    // If a frame carries its own debug_id, we trust it over debug_meta so
    // fixtures / custom transports can override the SDK's shape unambiguously.
    const preferred = "22222222-3333-4444-5555-666666666666";
    const other = "99999999-8888-7777-6666-555555555555";
    const map = await buildFixtureMap();
    const payload = buildPayload({
      frames: [{ filename: "app.js", function: "x", lineno: 1, colno: 15, debug_id: preferred }],
      debugMetaImages: [{ type: "sourcemap", code_file: "app.js", debug_id: other }],
    });

    const outcome = await symbolicatePayload(payload, buildResolver({ [preferred]: map }));

    expect(outcome).toBe("full");
  });

  it("marks non-sourcemap debug_meta entries as unusable", async () => {
    const payload = buildPayload({
      frames: [{ filename: "app.js", function: "x", lineno: 1, colno: 15 }],
      // wrong type — should be ignored, leaving the frame with no resolvable id
      debugMetaImages: [
        { type: "wasm", code_file: "app.js", debug_id: "aaaaaaaa-1234-1234-1234-1234567890ab" },
      ],
    });

    const outcome = await symbolicatePayload(payload, async () => null);

    expect(outcome).toBe("none");
    expect(payload.symbolicated).toBe("none");
  });

  it("returns 'partial' when only some debug_ids have stored maps", async () => {
    const hitId = "aaaaaaaa-hit0-0000-0000-000000000000";
    const missId = "bbbbbbbb-miss-0000-0000-000000000000";
    const map = await buildFixtureMap();
    const payload = buildPayload({
      frames: [
        { filename: "app.js", function: "x", lineno: 1, colno: 15, debug_id: hitId },
        { filename: "other.js", function: "y", lineno: 1, colno: 39, debug_id: missId },
      ],
    });

    const outcome = await symbolicatePayload(payload, buildResolver({ [hitId]: map }));

    expect(outcome).toBe("partial");
    const frames = (
      (payload.exception as { values: unknown[] }).values[0] as {
        stacktrace: { frames: Frame[] };
      }
    ).stacktrace.frames;
    expect(frames[0]?.filename).toBe("src/app.ts");
    // Missing map → frame left as-is.
    expect(frames[1]?.filename).toBe("other.js");
  });

  it("returns 'unavailable' when the resolver rejects for every debug_id", async () => {
    const payload = buildPayload({
      frames: [
        {
          filename: "app.js",
          function: "x",
          lineno: 1,
          colno: 15,
          debug_id: "cccccccc-fail-0000-0000-000000000000",
        },
      ],
    });

    const outcome = await symbolicatePayload(payload, async () => {
      throw new Error("blob store down");
    });

    expect(outcome).toBe("unavailable");
  });

  it("returns 'none' when the payload has no exception frames at all", async () => {
    const payload = { message: "just a message" } as Record<string, unknown>;
    const outcome = await symbolicatePayload(payload, async () => null);
    expect(outcome).toBe("none");
    expect(payload.symbolicated).toBe("none");
  });
});
