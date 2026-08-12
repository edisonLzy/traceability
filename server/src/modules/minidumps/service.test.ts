import { describe, expect, it, vi } from "vitest";

import type { ObjectStorage } from "../../infrastructure/object-storage/client.js";
import type { MinidumpRepository } from "./repository.js";
import { MinidumpService } from "./service.js";

describe("MinidumpService", () => {
  it("stores a validated dump and clears its durable ingest payload", async () => {
    const payload = Buffer.concat([Buffer.from("MDMP"), Buffer.alloc(12 * 1024)]);
    const complete = vi.fn(async () => undefined);
    const repository = {
      findIngestItem: vi.fn(async () => ({
        id: "00000000-0000-4000-8000-000000000001",
        envelopeId: "00000000-0000-4000-8000-000000000002",
        projectId: "00000000-0000-4000-8000-000000000003",
        status: "pending",
        header: {
          filename: "../native.dmp",
          content_type: "application/x-dmp",
          attachment_type: "event.minidump",
        },
        payload,
        eventId: "a".repeat(32),
      })),
      complete,
      markInvalid: vi.fn(async () => undefined),
    } as unknown as MinidumpRepository;
    const storage = stubStorage();
    const service = new MinidumpService(repository, storage);

    await service.processAttachmentItem("00000000-0000-4000-8000-000000000001");

    expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/^minidumps\//), payload, {
      contentType: "application/x-dmp",
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "a".repeat(32),
        fileName: "native.dmp",
        sizeBytes: payload.byteLength,
      }),
    );
  });

  it("marks an invalid durable payload as failed without uploading it", async () => {
    const markInvalid = vi.fn(async () => undefined);
    const repository = {
      findIngestItem: vi.fn(async () => ({
        id: "item-1",
        envelopeId: "envelope-1",
        projectId: "project-1",
        status: "pending",
        header: {},
        payload: Buffer.alloc(12 * 1024),
        eventId: null,
      })),
      markInvalid,
    } as unknown as MinidumpRepository;
    const storage = stubStorage();
    const service = new MinidumpService(repository, storage);

    await service.processAttachmentItem("item-1");

    expect(markInvalid).toHaveBeenCalledWith("item-1", "invalid_minidump");
    expect(storage.put).not.toHaveBeenCalled();
  });
});

function stubStorage(): ObjectStorage {
  return {
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => Buffer.alloc(0)),
    delete: vi.fn(async () => undefined),
    ping: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}
