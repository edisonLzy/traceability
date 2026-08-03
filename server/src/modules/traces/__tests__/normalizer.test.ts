import { describe, expect, it } from "vitest";

import { normalizeSpanItem, normalizeTransaction } from "../normalizer.js";

describe("trace normalizers", () => {
  it("normalizes a transaction root and its children", () => {
    const spans = normalizeTransaction({
      transaction: "im.push.recover",
      start_timestamp: 100,
      timestamp: 101,
      release: "desktop@1",
      environment: "test",
      measurements: { lcp: { value: 10, unit: "millisecond" } },
      contexts: {
        trace: {
          trace_id: "a".repeat(32),
          span_id: "b".repeat(16),
          op: "messaging.sync",
          status: "ok",
          data: { trigger: "gap" },
        },
      },
      spans: [
        {
          trace_id: "a".repeat(32),
          span_id: "c".repeat(16),
          parent_span_id: "b".repeat(16),
          description: "persist",
          start_timestamp: 100.1,
          timestamp: 100.8,
          data: {},
        },
      ],
    });

    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      name: "im.push.recover",
      op: "messaging.sync",
      isSegment: true,
      durationMs: 1_000,
      release: "desktop@1",
      measurements: { lcp: { value: 10, unit: "millisecond" } },
    });
    expect(spans[1]).toMatchObject({ parentSpanId: "b".repeat(16), name: "persist" });
  });

  it("normalizes typed v2 span attributes", () => {
    const [span] = normalizeSpanItem(
      { content_type: "application/vnd.sentry.items.span.v2+json" },
      {
        version: 2,
        items: [
          {
            trace_id: "a".repeat(32),
            span_id: "b".repeat(16),
            name: "recover",
            start_timestamp: 100,
            end_timestamp: 101,
            status: "ok",
            is_segment: true,
            attributes: {
              "sentry.op": { value: "messaging.sync", type: "string" },
              "sentry.release": { value: "desktop@1", type: "string" },
            },
          },
        ],
      },
    );
    expect(span).toMatchObject({ op: "messaging.sync", release: "desktop@1", isSegment: true });
  });
});
