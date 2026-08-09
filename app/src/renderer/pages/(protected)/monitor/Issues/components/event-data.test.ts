import { describe, expect, it } from "vitest";

import {
  buildEventContext,
  readBreadcrumbs,
  readExceptionValues,
  readStackFrames,
  shortId,
} from "./event-data";

describe("issue event data", () => {
  it("extracts exception values and sourcemap-resolved frames without mutating their order", () => {
    const payload: Record<string, unknown> = {
      symbolicated: "full",
      exception: {
        values: [
          {
            type: "TypeError",
            value: "boom",
            mechanism: { type: "generic", handled: false },
            stacktrace: {
              frames: [
                { filename: "outer.ts", function: "outer", lineno: 4, colno: 2 },
                {
                  filename: "src/app.ts",
                  function: "submit",
                  lineno: 12,
                  colno: 7,
                  pre_context: ["const before = true;"],
                  context_line: "throw new TypeError('boom');",
                  post_context: ["return false;"],
                  data: {
                    symbolicated: true,
                    source_context: "sourcemap",
                    raw_filename: "assets/app.js",
                    raw_lineno: 1,
                    raw_colno: 991,
                  },
                },
              ],
            },
          },
        ],
      },
    };

    expect(readExceptionValues(payload)).toEqual([
      { type: "TypeError", value: "boom", mechanism: "generic · handled: false" },
    ]);

    const frames = readStackFrames(payload);
    expect(frames.map((frame) => frame.functionName)).toEqual(["submit", "outer"]);
    expect(frames[0]).toMatchObject({
      file: "src/app.ts",
      resolved: true,
      context: {
        lines: ["const before = true;", "throw new TypeError('boom');", "return false;"],
        startLine: 11,
        errorLine: 12,
      },
      generated: { file: "assets/app.js", line: 1, column: 991 },
    });
  });

  it("does not mistake stale generated SDK context for restored source", () => {
    const frames = readStackFrames({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "src/app.ts",
                  lineno: 12,
                  colno: 7,
                  context_line: "minifiedGeneratedCode()",
                  data: { symbolicated: true, raw_filename: "app.js" },
                },
              ],
            },
          },
        ],
      },
    });

    expect(frames[0]?.context).toBeNull();
  });

  it("normalizes breadcrumbs and the required event context groups", () => {
    const payload: Record<string, unknown> = {
      breadcrumbs: {
        values: [
          {
            timestamp: 1_700_000_000,
            category: "fetch",
            type: "http",
            message: "GET /api/profile",
            data: { status_code: 200 },
          },
        ],
      },
      request: { url: "/settings/profile", method: "GET" },
      contexts: {
        browser: { name: "Chrome", version: "140" },
        trace: { status: "internal_error" },
        feature: { name: "profile" },
      },
      tags: { flow: "profile", handled: false },
      extra: { cacheHit: true, profileId: null },
      sdk: { name: "sentry.javascript.browser", version: "9.42.0" },
    };

    expect(readBreadcrumbs(payload)[0]).toMatchObject({
      category: "fetch",
      type: "http",
      message: "GET /api/profile",
      data: '{"status_code":200}',
    });

    const groups = buildEventContext(payload, { traceId: "trace-1", spanId: "span-1" });
    expect(groups.find((group) => group.title === "Request")?.rows).toEqual([
      { key: "url", value: "/settings/profile" },
      { key: "method", value: "GET" },
    ]);
    expect(groups.find((group) => group.title === "Runtime")?.rows).toContainEqual({
      key: "browser.name",
      value: "Chrome",
    });
    expect(groups.find((group) => group.title === "Trace")?.rows).toEqual([
      { key: "status", value: "internal_error" },
      { key: "trace_id", value: "trace-1" },
      { key: "span_id", value: "span-1" },
    ]);
    expect(groups.find((group) => group.title === "Tags")?.tags).toEqual([
      "flow: profile",
      "handled: false",
    ]);
    expect(groups.find((group) => group.title === "Additional contexts")?.rows).toEqual([
      { key: "feature.name", value: "profile" },
    ]);
  });

  it("shortens long identifiers while keeping both ends", () => {
    expect(shortId("f9b1c28a4dca497394d0d44b9c2b7da4")).toBe("f9b1c28a…2b7da4");
    expect(shortId("short")).toBe("short");
  });
});
