import { describe, expect, it } from "vitest";

import { TelemetryValidationError, validateTelemetryItem } from "../telemetry-validator.js";

const traceId = "a".repeat(32);
const spanId = "b".repeat(16);

describe("validateTelemetryItem", () => {
  it("accepts a transaction with child spans", () => {
    expect(() =>
      validateTelemetryItem(
        "transaction",
        { type: "transaction" },
        {
          event_id: "c".repeat(32),
          transaction: "message.recover",
          start_timestamp: 100,
          timestamp: 101,
          contexts: { trace: { trace_id: traceId, span_id: spanId, op: "messaging.sync" } },
          spans: [
            {
              trace_id: traceId,
              span_id: "d".repeat(16),
              parent_span_id: spanId,
              start_timestamp: 100.1,
              timestamp: 100.9,
              data: { recovered: 3 },
            },
          ],
        },
      ),
    ).not.toThrow();
  });

  it("accepts single and v2 span items", () => {
    expect(() =>
      validateTelemetryItem(
        "span",
        { type: "span" },
        {
          trace_id: traceId,
          span_id: spanId,
          start_timestamp: 100,
          timestamp: 101,
          data: {},
        },
      ),
    ).not.toThrow();
    expect(() =>
      validateTelemetryItem(
        "span",
        {
          type: "span",
          item_count: 1,
          content_type: "application/vnd.sentry.items.span.v2+json",
        },
        {
          version: 2,
          items: [
            {
              trace_id: traceId,
              span_id: spanId,
              name: "recover",
              start_timestamp: 100,
              end_timestamp: 101,
              status: "ok",
              is_segment: true,
              attributes: { "sentry.op": { value: "messaging.sync", type: "string" } },
            },
          ],
        },
      ),
    ).not.toThrow();
  });

  it("accepts counter, gauge, and distribution samples", () => {
    const items = (["counter", "gauge", "distribution"] as const).map((type, index) => ({
      timestamp: 100 + index,
      trace_id: traceId,
      span_id: spanId,
      name: `im.push.${type}`,
      type,
      unit: "millisecond",
      value: index + 1,
      attributes: { state: { value: "connected", type: "string" } },
    }));
    expect(() =>
      validateTelemetryItem(
        "trace_metric",
        { type: "trace_metric", item_count: 3 },
        {
          version: 2,
          items,
        },
      ),
    ).not.toThrow();
  });

  it("rejects count mismatch, invalid typed attributes, and non-finite values", () => {
    expect(() =>
      validateTelemetryItem(
        "trace_metric",
        { type: "trace_metric", item_count: 2 },
        {
          version: 2,
          items: [],
        },
      ),
    ).toThrow("item_count");
    expect(() =>
      validateTelemetryItem(
        "trace_metric",
        { type: "trace_metric", item_count: 1 },
        {
          version: 2,
          items: [
            {
              timestamp: 100,
              trace_id: traceId,
              name: "broken",
              type: "gauge",
              value: 1,
              attributes: { state: { value: 10, type: "string" } },
            },
          ],
        },
      ),
    ).toThrow(TelemetryValidationError);
    expect(() =>
      validateTelemetryItem(
        "span",
        { type: "span" },
        {
          trace_id: traceId,
          span_id: spanId,
          start_timestamp: 100,
          timestamp: Number.POSITIVE_INFINITY,
        },
      ),
    ).toThrow("finite");
  });

  it("rejects invalid container versions, reversed timestamps, and oversized attributes", () => {
    expect(() =>
      validateTelemetryItem(
        "trace_metric",
        { type: "trace_metric", item_count: 1 },
        {
          version: 1,
          items: [
            {
              timestamp: 100,
              trace_id: traceId,
              name: "unsupported.version",
              type: "counter",
              value: 1,
            },
          ],
        },
      ),
    ).toThrow("version");

    expect(() =>
      validateTelemetryItem(
        "transaction",
        { type: "transaction" },
        {
          transaction: "reversed",
          start_timestamp: 101,
          timestamp: 100,
          contexts: { trace: { trace_id: traceId, span_id: spanId } },
        },
      ),
    ).toThrow("precedes");

    const attributes = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [
        `attribute_${index}`,
        { value: index, type: "integer" },
      ]),
    );
    expect(() =>
      validateTelemetryItem(
        "trace_metric",
        { type: "trace_metric", item_count: 1 },
        {
          version: 2,
          items: [
            {
              timestamp: 100,
              trace_id: traceId,
              name: "too.many.attributes",
              type: "gauge",
              value: 1,
              attributes,
            },
          ],
        },
      ),
    ).toThrow("maximum attribute count");
  });
});
