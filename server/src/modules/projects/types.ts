export interface ProjectPolicy {
  allowedOrigins: string[];
  rateLimitPerSecond: number;
  enabledItemTypes: string[];
  scrubRules: Record<string, unknown>;
  version: number;
}

export interface ProjectKeyView {
  id: string;
  publicKey: string;
  status: "active" | "disabled" | "revoked";
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateProjectInput {
  slug: string;
  name: string;
  platform: "javascript";
}

export interface UpdateProjectInput {
  name?: string;
  enabled?: boolean;
}

export interface UpdateProjectPolicyInput {
  allowedOrigins: string[];
  rateLimitPerSecond: number;
  enabledItemTypes: string[];
  scrubRules: Record<string, unknown>;
}
