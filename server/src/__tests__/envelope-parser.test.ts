import { describe, expect, it } from "vitest";

import { EnvelopeParseError, parseEnvelope } from "../modules/ingest/envelope-parser.js";

const limits = { maxItems: 20, maxItemBytes: 1024 };

describe("parseEnvelope", () => {
  it("parses length-delimited binary items without splitting their payload on newlines", () => {
    const binary = Buffer.from([0x61, 0x0a, 0x62]);
    const body = Buffer.concat([
      Buffer.from('{"dsn":"https://key@example.test/42"}\n'),
      Buffer.from(`{"type":"attachment","length":${binary.length}}\n`),
      binary,
      Buffer.from("\n"),
      Buffer.from('{"type":"event"}\n{"event_id":"event-1","message":"boom"}\n'),
    ]);

    const envelope = parseEnvelope(body, limits);

    expect(envelope.items).toHaveLength(2);
    expect(envelope.items[0]?.payload).toEqual(binary);
    expect(envelope.items[1]?.type).toBe("event");
  });

  it("rejects truncated length-delimited items", () => {
    const body = Buffer.from(
      '{"dsn":"https://key@example.test/42"}\n{"type":"attachment","length":4}\nabc',
    );

    expect(() => parseEnvelope(body, limits)).toThrow(EnvelopeParseError);
  });
});
