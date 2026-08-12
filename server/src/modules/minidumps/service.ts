import { createHash } from "node:crypto";
import { basename } from "node:path";

import {
  ObjectNotFoundError,
  type ObjectStorage,
} from "../../infrastructure/object-storage/client.js";
import type { MinidumpRepository } from "./repository.js";
import type { MinidumpSummary } from "./types.js";

export class MinidumpService {
  public constructor(
    private readonly repository: MinidumpRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async processAttachmentItem(itemId: string): Promise<void> {
    const item = await this.repository.findIngestItem(itemId);
    if (!item || item.status !== "pending") return;
    if (!item.payload || !isMinidump(item.payload)) {
      await this.repository.markInvalid(itemId, "invalid_minidump");
      return;
    }

    const sha256 = createHash("sha256").update(item.payload).digest("hex");
    const fileName = safeFileName(item.header.filename, `${item.eventId ?? item.id}.dmp`);
    const contentType = "application/x-dmp";
    const eventKey =
      item.eventId && /^[0-9a-f]{32}$/i.test(item.eventId) ? item.eventId : item.envelopeId;
    const storageKey = `minidumps/${item.projectId}/${eventKey}/${item.id}.dmp`;

    await this.storage.put(storageKey, item.payload, { contentType });
    await this.repository.complete({
      projectId: item.projectId,
      ingestItemId: item.id,
      eventId: item.eventId,
      fileName,
      contentType,
      storageKey,
      sizeBytes: item.payload.byteLength,
      sha256,
    });
  }

  async listForEvent(projectId: string, eventId: string): Promise<MinidumpSummary[]> {
    const rows = await this.repository.listForEvent(projectId, eventId);
    return rows.map(toSummary);
  }

  async listForIssue(issueId: string): Promise<MinidumpSummary[]> {
    const rows = await this.repository.listForIssue(issueId);
    return rows.map(toSummary);
  }

  async download(id: string): Promise<{ metadata: MinidumpSummary; body: Buffer } | null> {
    const row = await this.repository.findById(id);
    if (!row) return null;
    try {
      const body = await this.storage.get(row.storageKey);
      return { metadata: toSummary(row), body };
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return null;
      throw error;
    }
  }
}

function isMinidump(body: Buffer): boolean {
  return body.byteLength >= 10 * 1024 && body.subarray(0, 4).toString("ascii") === "MDMP";
}

function safeFileName(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  const name = [...basename(value)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .slice(0, 255);
  return name || fallback;
}

function toSummary(row: {
  id: string;
  projectId: string;
  eventId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}): MinidumpSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    eventId: row.eventId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    createdAt: row.createdAt,
  };
}
