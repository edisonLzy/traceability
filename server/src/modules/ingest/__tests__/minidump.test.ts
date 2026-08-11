import { describe, expect, it, vi } from "vitest";

import type { IngestRepository } from "../repository.js";
import { IngestService, type ProjectKeyLookup } from "../service.js";

const dsn = "https://public-key@example.test/42";

describe("minidump envelope ingest", () => {
  it("accepts a minidump larger than the normal item limit without copying it into the sanitized envelope", async () => {
    const minidump = validMinidump(12 * 1024);
    const { service, persist } = buildService(["event", "attachment"]);

    const result = await service.ingest({
      pathProjectId: "42",
      body: nativeEnvelope(minidump),
      clientIp: "127.0.0.1",
    });

    expect(result.eventId).toBe("a".repeat(32));
    const input = persist.mock.calls[0]![0];
    expect(input.items).toHaveLength(2);
    expect(input.items[0]).toMatchObject({ type: "event", status: "pending" });
    expect(input.items[1]).toMatchObject({
      type: "attachment",
      eventId: "a".repeat(32),
      status: "pending",
    });
    expect(input.items[1]?.payload).toEqual(minidump);
    expect(input.sanitizedEnvelope.byteLength).toBeLessThan(2_000);
    expect(input.sanitizedEnvelope.toString("utf8")).toContain(
      '"traceability_payload_omitted":true',
    );
  });

  it("rejects a fake minidump attachment while preserving its sibling event", async () => {
    const fakeDump = Buffer.alloc(12 * 1024, 0x61);
    const { service, persist } = buildService(["event", "attachment"]);

    await service.ingest({
      pathProjectId: "42",
      body: nativeEnvelope(fakeDump),
      clientIp: "127.0.0.1",
    });

    const input = persist.mock.calls[0]![0];
    expect(input.items[0]).toMatchObject({ type: "event", status: "pending" });
    expect(input.items[1]).toMatchObject({
      type: "attachment",
      status: "ignored",
      errorCode: "invalid_minidump",
      payload: null,
    });
  });

  it("keeps the normal compressed envelope limit for uploads without a minidump", async () => {
    const { service, persist } = buildService(["event", "attachment"]);

    await expect(
      service.ingest({
        pathProjectId: "42",
        body: ordinaryLargeEnvelope(),
        clientIp: "127.0.0.1",
      }),
    ).rejects.toMatchObject({ statusCode: 413, code: "envelope_too_large" });
    expect(persist).not.toHaveBeenCalled();
  });
});

function buildService(enabledItemTypes: string[]) {
  const persist = vi.fn(async (input: Parameters<IngestRepository["persist"]>[0]) => ({
    envelope: { id: "envelope-1" },
    items: input.items.map((item, index) => ({ id: `item-${index}`, ...item })),
  }));
  const repository = { persist } as unknown as IngestRepository;
  const projectLookup: ProjectKeyLookup = {
    findIngestProject: vi.fn(async () => ({
      projectId: "00000000-0000-4000-8000-000000000042",
      projectKeyId: "00000000-0000-4000-8000-000000000043",
      allowedOrigins: [],
      enabledItemTypes,
      rateLimitPerSecond: 100,
    })),
  };
  const service = new IngestService(
    repository,
    projectLookup,
    {
      maxCompressedBytes: 5 * 1024,
      maxDecompressedBytes: 5 * 1024,
      maxItems: 20,
      maxItemBytes: 1024,
      replayMaxRecordingBytes: 10 * 1024,
      minidumpMaxBytes: 20 * 1024,
    },
    "",
  );
  return { service, persist };
}

function validMinidump(size: number): Buffer {
  return Buffer.concat([Buffer.from("MDMP"), Buffer.alloc(size - 4, 0x2a)]);
}

function nativeEnvelope(minidump: Buffer): Buffer {
  const eventId = "a".repeat(32);
  const event = JSON.stringify({
    event_id: eventId,
    platform: "native",
    level: "fatal",
    tags: { "event.environment": "native", "event.process": "browser" },
  });
  return Buffer.concat([
    Buffer.from(
      [
        JSON.stringify({ event_id: eventId, dsn }),
        JSON.stringify({ type: "event", content_type: "application/json" }),
        event,
        JSON.stringify({
          type: "attachment",
          attachment_type: "event.minidump",
          content_type: "application/x-dmp",
          filename: "native.dmp",
          length: minidump.byteLength,
        }),
        "",
      ].join("\n"),
    ),
    minidump,
  ]);
}

function ordinaryLargeEnvelope(): Buffer {
  const parts = [JSON.stringify({ event_id: "b".repeat(32), dsn })];
  for (let index = 0; index < 6; index += 1) {
    const event = JSON.stringify({
      event_id: index.toString(16).padStart(32, "0"),
      message: "x".repeat(800),
    });
    parts.push(JSON.stringify({ type: "event", length: Buffer.byteLength(event) }), event);
  }
  return Buffer.from(`${parts.join("\n")}\n`);
}
