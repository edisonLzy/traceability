import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";

import type { RuntimeConfig } from "../../config/index.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyPassword,
  type AuthenticatedUser,
} from "../../helper/auth.js";
import type { AuthStore, AuthUser } from "./repository.js";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export class AuthService {
  public constructor(
    private readonly repository: AuthStore,
    private readonly config: Pick<RuntimeConfig, "jwtSecret" | "jwtAccessTokenTtlSeconds">,
    private readonly refreshTokenTtlSeconds: number,
  ) {}

  async login(input: LoginInput) {
    const user = await this.repository.findUserByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw unauthorized("Invalid email or password");
    }
    const tokenPair = await this.issueTokenPair(user, randomUUID());
    return { user: toAuthenticatedUser(user), ...tokenPair };
  }

  async refresh(input: RefreshInput) {
    const tokenHash = hashRefreshToken(input.refreshToken);
    const token = await this.repository.findRefreshTokenByHash(tokenHash);
    if (!token || token.expiresAt <= new Date()) {
      if (token) await this.repository.deleteRefreshTokenByHash(tokenHash);
      throw unauthorized("Invalid refresh token");
    }
    const user = await this.repository.findUserById(token.userId);
    if (!user) throw unauthorized("Invalid refresh token");

    await this.repository.deleteRefreshTokenByHash(tokenHash);
    return this.issueTokenPair(user, token.familyId);
  }

  private async issueTokenPair(user: AuthUser, familyId: string) {
    const refreshToken = createRefreshToken();
    await this.repository.createRefreshToken({
      tokenHash: hashRefreshToken(refreshToken),
      userId: user.id,
      familyId,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
    });
    return { accessToken: createAccessToken(toAuthenticatedUser(user), this.config), refreshToken };
  }
}

function toAuthenticatedUser(user: AuthUser): AuthenticatedUser {
  return { id: user.id, username: user.username, email: user.email };
}

function unauthorized(message: string): TRPCError {
  return new TRPCError({ code: "UNAUTHORIZED", message });
}
