import { createHash } from "node:crypto";

import {
  ObjectNotFoundError,
  type ObjectStorage,
} from "../../infrastructure/object-storage/client.js";
import type { ArtifactRow, SourcemapRepository } from "./repository.js";

export interface UploadInput {
  projectId: string;
  debugId: string;
  fileName: string;
  body: Buffer;
}

export interface UploadResult {
  row: ArtifactRow;
  reused: boolean;
}

/**
 * Coordinates the sourcemap artifact table with the object storage backend so
 * a single sha256-identical map is stored once even if uploaded repeatedly.
 */
export class SourcemapService {
  public constructor(
    private readonly repository: SourcemapRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async upload(input: UploadInput): Promise<UploadResult> {
    const sha256 = createHash("sha256").update(input.body).digest("hex");
    const storageKey = buildStorageKey(input.projectId, input.debugId);
    const { row, alreadyPresent } = await this.repository.upsert({
      projectId: input.projectId,
      debugId: input.debugId,
      fileName: input.fileName,
      storageKey,
      sizeBytes: input.body.byteLength,
      sha256,
    });

    // Only touch the blob when the DB row is fresh or the content changed.
    if (!alreadyPresent) {
      await this.storage.put(storageKey, input.body, { contentType: "application/json" });
    }
    return { row, reused: alreadyPresent };
  }

  /**
   * Fetch the raw map bytes for a given debug_id. Returns null when either the
   * DB row or the blob is missing so callers can degrade gracefully.
   */
  async findMapBody(projectId: string, debugId: string): Promise<Buffer | null> {
    const row = await this.repository.findByDebugId(projectId, debugId);
    if (!row) return null;
    try {
      return await this.storage.get(row.storageKey);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return null;
      throw error;
    }
  }

  listByProject(projectId: string, limit?: number): Promise<ArtifactRow[]> {
    return this.repository.listByProject(projectId, limit);
  }

  async remove(projectId: string, artifactId: string): Promise<ArtifactRow | null> {
    const deleted = await this.repository.deleteById(projectId, artifactId);
    if (!deleted) return null;
    // Best-effort blob cleanup; the DB row is the source of truth.
    try {
      await this.storage.delete(deleted.storageKey);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
    return deleted;
  }
}

function buildStorageKey(projectId: string, debugId: string): string {
  return `sourcemaps/${projectId}/${debugId}.map`;
}
