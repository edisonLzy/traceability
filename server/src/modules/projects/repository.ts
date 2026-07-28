import { randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { projectKeys, projectPolicies, projects } from "./schema.js";
import type { CreateProjectInput, UpdateProjectInput, UpdateProjectPolicyInput } from "./types.js";

export class ProjectRepository {
  public constructor(private readonly database: Database) {}

  list() {
    return this.database.db.select().from(projects).orderBy(projects.createdAt);
  }

  async create(input: CreateProjectInput) {
    const [project] = await this.database.db.insert(projects).values(input).returning();
    if (!project) throw new Error("project insert did not return a row");
    return project;
  }

  async findById(projectId: string) {
    const [project] = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  async update(projectId: string, input: UpdateProjectInput) {
    const [project] = await this.database.db
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return project ?? null;
  }

  async delete(projectId: string) {
    const [project] = await this.database.db
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning();
    return project ?? null;
  }

  listKeys(projectId: string) {
    return this.database.db.select().from(projectKeys).where(eq(projectKeys.projectId, projectId));
  }

  async createKey(projectId: string) {
    const publicKey = randomBytes(16).toString("hex");
    const [key] = await this.database.db
      .insert(projectKeys)
      .values({ projectId, publicKey })
      .returning();
    if (!key) throw new Error("project key insert did not return a row");
    return key;
  }

  async createDefaultPolicy(projectId: string) {
    await this.database.db.insert(projectPolicies).values({ projectId });
  }

  async revokeKey(projectId: string, keyId: string) {
    const [key] = await this.database.db
      .update(projectKeys)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(eq(projectKeys.projectId, projectId), eq(projectKeys.id, keyId)))
      .returning();
    return key ?? null;
  }

  async getPolicy(projectId: string) {
    const [policy] = await this.database.db
      .select()
      .from(projectPolicies)
      .where(eq(projectPolicies.projectId, projectId))
      .limit(1);
    return policy ?? null;
  }

  async updatePolicy(projectId: string, input: UpdateProjectPolicyInput) {
    const [policy] = await this.database.db
      .update(projectPolicies)
      .set({ ...input, updatedAt: new Date(), version: sql`${projectPolicies.version} + 1` })
      .where(eq(projectPolicies.projectId, projectId))
      .returning();
    return policy ?? null;
  }

  async findIngestProject(rawSentryProjectId: string, publicKey: string) {
    const sentryProjectId = Number(rawSentryProjectId);
    if (!Number.isSafeInteger(sentryProjectId) || sentryProjectId < 1) return null;
    const [record] = await this.database.db
      .select({
        projectId: projects.id,
        projectKeyId: projectKeys.id,
        projectEnabled: projects.enabled,
        keyStatus: projectKeys.status,
        allowedOrigins: projectPolicies.allowedOrigins,
        enabledItemTypes: projectPolicies.enabledItemTypes,
        rateLimitPerSecond: projectPolicies.rateLimitPerSecond,
      })
      .from(projects)
      .innerJoin(projectKeys, eq(projectKeys.projectId, projects.id))
      .innerJoin(projectPolicies, eq(projectPolicies.projectId, projects.id))
      .where(
        and(eq(projects.sentryProjectId, sentryProjectId), eq(projectKeys.publicKey, publicKey)),
      )
      .limit(1);

    if (!record || !record.projectEnabled || record.keyStatus !== "active") return null;
    return {
      projectId: record.projectId,
      projectKeyId: record.projectKeyId,
      allowedOrigins: record.allowedOrigins,
      enabledItemTypes: record.enabledItemTypes,
      rateLimitPerSecond: record.rateLimitPerSecond,
    };
  }
}
