import { close, flush } from "@sentry/browser";
import { afterEach, describe, expect, it } from "vitest";

import { init, metrics, startSpan } from "../src/browser/index.js";

describe("Monitor telemetry exports", () => {
  afterEach(async () => {
    await close(1_000);
  });

  it("sends linked transaction and trace_metric envelopes", async () => {
    const envelopes: unknown[] = [];
    init({
      dsn: "https://0123456789abcdef0123456789abcdef@example.com/1",
      tracesSampleRate: 1,
      transport: () => ({
        send(envelope) {
          envelopes.push(envelope);
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });

    startSpan({ name: "telemetry.contract", op: "test", forceTransaction: true }, (span) => {
      metrics.count("contract.count", 1, { attributes: { state: "ok" } });
      metrics.gauge("contract.gauge", 2);
      metrics.distribution("contract.distribution", 3, { unit: "millisecond" });
      expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    });
    await flush(1_000);

    const serialized = JSON.stringify(envelopes);
    expect(serialized).toContain("transaction");
    expect(serialized).toContain("trace_metric");
    expect(serialized).toContain("contract.count");
    expect(serialized).toContain("span_id");
  });
});
