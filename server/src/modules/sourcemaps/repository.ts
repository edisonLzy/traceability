import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { sourcemapArtifacts } from "./schema.js";

export interface ArtifactRow {
  id: string;
  projectId: string;
  debugId: string;
  fileName: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: Date;
}

export interface UpsertArtifactInput {
  projectId: string;
  debugId: string;
  fileName: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

export class SourcemapRepository {
  public constructor(private readonly database: Database) {}

  /**
   * Insert or update an artifact keyed by (projectId, debugId). Returns the
   * stored row plus a flag indicating whether the content already existed under
   * the same sha256, so callers can skip re-uploading to blob storage.
   */
  async upsert(input: UpsertArtifactInput): Promise<{ row: ArtifactRow; alreadyPresent: boolean }> {
    return this.database.db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(sourcemapArtifacts)
        .where(
          and(
            eq(sourcemapArtifacts.projectId, input.projectId),
            eq(sourcemapArtifacts.debugId, input.debugId),
          ),
        )
        .limit(1);

      if (existing && existing.sha256 === input.sha256) {
        return { row: existing, alreadyPresent: true };
      }

      const [row] = await transaction
        .insert(sourcemapArtifacts)
        .values(input)
        .onConflictDoUpdate({
          target: [sourcemapArtifacts.projectId, sourcemapArtifacts.debugId],
          set: {
            fileName: input.fileName,
            storageKey: input.storageKey,
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
            uploadedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error("sourcemap upsert did not return a row");
      return { row, alreadyPresent: false };
    });
  }

  async findByDebugId(projectId: string, debugId: string): Promise<ArtifactRow | null> {
    const [row] = await this.database.db
      .select()
      .from(sourcemapArtifacts)
      .where(
        and(eq(sourcemapArtifacts.projectId, projectId), eq(sourcemapArtifacts.debugId, debugId)),
      )
      .limit(1);
    return row ?? null;
  }

  listByProject(projectId: string, limit = 100): Promise<ArtifactRow[]> {
    return this.database.db
      .select()
      .from(sourcemapArtifacts)
      .where(eq(sourcemapArtifacts.projectId, projectId))
      .orderBy(desc(sourcemapArtifacts.uploadedAt))
      .limit(limit);
  }

  async deleteById(projectId: string, artifactId: string): Promise<ArtifactRow | null> {
    const [row] = await this.database.db
      .delete(sourcemapArtifacts)
      .where(
        and(eq(sourcemapArtifacts.projectId, projectId), eq(sourcemapArtifacts.id, artifactId)),
      )
      .returning();
    return row ?? null;
  }
}
