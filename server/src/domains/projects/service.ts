import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { RuntimeConfig } from "../../config/index.js";
import type { PostgresDatabase } from "../../db/postgres.js";
import { organizations, projectKeys, projectPolicies, projects } from "../../db/schema/index.js";

const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

export const CreateProjectSchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1).max(200),
  platform: z.literal("javascript").default("javascript"),
});

export const UpdateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "at least one field is required");

export const UpdateProjectPolicySchema = z.object({
  allowedOrigins: z.array(z.string().url()).max(100),
  rateLimitPerSecond: z.coerce.number().int().min(1).max(10_000),
  enabledItemTypes: z.array(z.string().min(1).max(64)).max(50),
  scrubRules: z.record(z.string(), z.unknown()).default({}),
});

export class ProjectService {
  public constructor(
    private readonly database: PostgresDatabase,
    private readonly config: RuntimeConfig,
  ) {}

  async listProjects() {
    return this.database.db.select().from(projects).orderBy(projects.createdAt);
  }

  async createProject(raw: unknown) {
    const input = CreateProjectSchema.parse(raw);
    const organization = await this.ensureDefaultOrganization();
    const [project] = await this.database.db
      .insert(projects)
      .values({
        organizationId: organization.id,
        slug: input.slug,
        name: input.name,
        platform: input.platform,
      })
      .returning();

    if (!project) throw new Error("project insert did not return a row");

    const key = await this.createProjectKey(project.id);
    await this.database.db.insert(projectPolicies).values({ projectId: project.id });

    return { project, key, dsn: this.createDsn(key.publicKey, project.sentryProjectId) };
  }

  async getProject(projectId: string) {
    const [project] = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  async updateProject(projectId: string, raw: unknown) {
    const input = UpdateProjectSchema.parse(raw);
    const [project] = await this.database.db
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return project ?? null;
  }

  async deleteProject(projectId: string) {
    const [project] = await this.database.db
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning();
    return project ?? null;
  }

  async listKeys(projectId: string) {
    return this.database.db.select().from(projectKeys).where(eq(projectKeys.projectId, projectId));
  }

  async createKey(projectId: string) {
    const project = await this.getProject(projectId);
    if (!project) return null;
    const key = await this.createProjectKey(projectId);
    return { key, dsn: this.createDsn(key.publicKey, project.sentryProjectId) };
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

  async updatePolicy(projectId: string, raw: unknown) {
    const input = UpdateProjectPolicySchema.parse(raw);
    const [policy] = await this.database.db
      .update(projectPolicies)
      .set({ ...input, updatedAt: new Date(), version: sql`${projectPolicies.version} + 1` })
      .where(eq(projectPolicies.projectId, projectId))
      .returning();
    return policy ?? null;
  }

  private async ensureDefaultOrganization() {
    await this.database.db
      .insert(organizations)
      .values({
        id: randomUUID(),
        slug: this.config.defaultOrganizationSlug,
        name: this.config.defaultOrganizationName,
      })
      .onConflictDoNothing();

    const [organization] = await this.database.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, this.config.defaultOrganizationSlug))
      .limit(1);
    if (!organization) throw new Error("default organization could not be created");
    return organization;
  }

  private async createProjectKey(projectId: string) {
    // Sentry SDK DSN validation expects an alphanumeric 32-character public key.
    const publicKey = randomBytes(16).toString("hex");
    const [key] = await this.database.db
      .insert(projectKeys)
      .values({ projectId, publicKey })
      .returning();
    if (!key) throw new Error("project key insert did not return a row");
    return key;
  }

  private createDsn(publicKey: string, sentryProjectId: number): string {
    const ingestUrl = new URL(this.config.publicIngestUrl);
    ingestUrl.username = publicKey;
    ingestUrl.password = "";
    ingestUrl.pathname = `${ingestUrl.pathname.replace(/\/$/, "")}/${sentryProjectId}`;
    return ingestUrl.toString();
  }
}
