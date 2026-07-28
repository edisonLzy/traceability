import type { RuntimeConfig } from "../../config/index.js";
import type { ProjectRepository } from "./repository.js";
import type { CreateProjectInput, UpdateProjectInput, UpdateProjectPolicyInput } from "./types.js";

export class ProjectService {
  public constructor(
    private readonly repository: ProjectRepository,
    private readonly config: RuntimeConfig,
  ) {}

  listProjects() {
    return this.repository.list();
  }

  async createProject(input: CreateProjectInput) {
    const project = await this.repository.create(input);
    const key = await this.repository.createKey(project.id);
    await this.repository.createDefaultPolicy(project.id);
    return { project, key, dsn: this.createDsn(key.publicKey, project.sentryProjectId) };
  }

  getProject(projectId: string) {
    return this.repository.findById(projectId);
  }

  updateProject(projectId: string, input: UpdateProjectInput) {
    return this.repository.update(projectId, input);
  }

  deleteProject(projectId: string) {
    return this.repository.delete(projectId);
  }

  listKeys(projectId: string) {
    return this.repository.listKeys(projectId);
  }

  async createKey(projectId: string) {
    const project = await this.repository.findById(projectId);
    if (!project) return null;
    const key = await this.repository.createKey(projectId);
    return { key, dsn: this.createDsn(key.publicKey, project.sentryProjectId) };
  }

  revokeKey(projectId: string, keyId: string) {
    return this.repository.revokeKey(projectId, keyId);
  }

  getPolicy(projectId: string) {
    return this.repository.getPolicy(projectId);
  }

  updatePolicy(projectId: string, input: UpdateProjectPolicyInput) {
    return this.repository.updatePolicy(projectId, input);
  }

  findIngestProject(sentryProjectId: string, publicKey: string) {
    return this.repository.findIngestProject(sentryProjectId, publicKey);
  }

  private createDsn(publicKey: string, sentryProjectId: number): string {
    const ingestUrl = new URL(this.config.publicIngestUrl);
    ingestUrl.username = publicKey;
    ingestUrl.password = "";
    ingestUrl.pathname = `${ingestUrl.pathname.replace(/\/$/, "")}/${sentryProjectId}`;
    return ingestUrl.toString();
  }
}
