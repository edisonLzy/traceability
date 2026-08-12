import { gzipSync } from "node:zlib";

import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAccessToken } from "../../helper/auth.js";
import { parseEnvelope } from "../ingest/envelope-parser.js";
import { minidumpDownloadRoute, minidumpUploadRoute } from "./route.js";

describe("minidump upload route", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("converts Electron crashReporter multipart uploads into an event plus minidump envelope", async () => {
    const eventId = "b".repeat(32);
    const ingest = vi.fn(
      async (_input: { pathProjectId: string; publicKey?: string; body: Buffer }) => ({
        eventId,
        envelopeId: "envelope-1",
      }),
    );
    const app = Fastify();
    app.decorate("config", { minidumpMaxBytes: 20 * 1024, ingestMaxItemBytes: 1024 } as never);
    app.decorate("container", { ingest: { ingest } } as never);
    await app.register(minidumpUploadRoute);
    apps.push(app);

    const minidump = Buffer.concat([Buffer.from("MDMP"), Buffer.alloc(12 * 1024)]);
    const boundary = "traceability-minidump-boundary";
    const payload = multipartBody(boundary, {
      fields: {
        sentry__1: JSON.stringify({
          event_id: eventId,
          release: "desktop@1.0.0",
          tags: { scenario: "native-crash" },
        }),
        process_type: "browser",
      },
      file: minidump,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/42/minidump/?sentry_key=public-key",
      payload: gzipSync(payload),
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-encoding": "gzip",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ id: eventId });
    const input = ingest.mock.calls[0]![0];
    expect(input).toMatchObject({ pathProjectId: "42", publicKey: "public-key" });
    const envelope = parseEnvelope(input.body, {
      maxItems: 5,
      maxItemBytes: 1024,
      maxMinidumpBytes: 20 * 1024,
    });
    expect(envelope.items.map((item) => item.type)).toEqual(["event", "attachment"]);
    expect(JSON.parse(envelope.items[0]!.payload.toString("utf8"))).toMatchObject({
      event_id: eventId,
      platform: "native",
      level: "fatal",
      tags: {
        scenario: "native-crash",
        "event.environment": "native",
        "event.process": "browser",
      },
    });
    expect(envelope.items[1]!.payload).toEqual(minidump);
  });

  it("streams an authenticated minidump download", async () => {
    const jwtSecret = "a secure secret that contains at least thirty-two characters";
    const body = Buffer.concat([Buffer.from("MDMP"), Buffer.alloc(12 * 1024)]);
    const app = Fastify();
    app.decorate("config", { jwtSecret, jwtAccessTokenTtlSeconds: 900 } as never);
    app.decorate("container", {
      minidumps: {
        download: vi.fn(async () => ({
          metadata: {
            id: "00000000-0000-4000-8000-000000000001",
            projectId: "00000000-0000-4000-8000-000000000002",
            eventId: "a".repeat(32),
            fileName: "native.dmp",
            contentType: "application/x-dmp",
            sizeBytes: body.byteLength,
            sha256: "0".repeat(64),
            createdAt: new Date(),
          },
          body,
        })),
      },
    } as never);
    await app.register(minidumpDownloadRoute);
    apps.push(app);
    const token = createAccessToken(
      { id: "00000000-0000-4000-8000-000000000003", username: "root", email: "root@root.com" },
      { jwtSecret, jwtAccessTokenTtlSeconds: 900 },
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/minidumps/00000000-0000-4000-8000-000000000001/download",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(body);
  });
});

function multipartBody(
  boundary: string,
  input: { fields: Record<string, string>; file: Buffer },
): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(input.fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="upload_file_minidump"; filename="native.dmp"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    input.file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return Buffer.concat(chunks);
}
