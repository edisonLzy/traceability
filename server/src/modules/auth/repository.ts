import { eq } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { authRefreshTokens, authUsers } from "./schema.js";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
}

export interface AuthRefreshToken {
  id: string;
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
}

export interface CreateAuthRefreshToken {
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  findRefreshTokenByHash(tokenHash: string): Promise<AuthRefreshToken | null>;
  createRefreshToken(record: CreateAuthRefreshToken): Promise<void>;
  deleteRefreshTokenByHash(tokenHash: string): Promise<void>;
}

export class AuthRepository implements AuthStore {
  public constructor(private readonly database: Database) {}

  async findUserByEmail(email: string) {
    const [user] = await this.database.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);
    return user ?? null;
  }

  async findUserById(id: string) {
    const [user] = await this.database.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, id))
      .limit(1);
    return user ?? null;
  }

  async findRefreshTokenByHash(tokenHash: string) {
    const [token] = await this.database.db
      .select()
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.tokenHash, tokenHash))
      .limit(1);
    return token ?? null;
  }

  async createRefreshToken(record: CreateAuthRefreshToken) {
    await this.database.db.insert(authRefreshTokens).values(record);
  }

  async deleteRefreshTokenByHash(tokenHash: string) {
    await this.database.db
      .delete(authRefreshTokens)
      .where(eq(authRefreshTokens.tokenHash, tokenHash));
  }
}
