import { describe, expect, it } from "vitest";

import type { AuthRefreshToken, AuthStore, AuthUser } from "./repository.js";
import { AuthService } from "./service.js";

const user: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "root",
  email: "root@root.com",
  passwordHash: "$2b$10$Kx9Gdl3GbPxYacWepUIN3eqTZfTNc6vCPS/7Oz5X.49LsllqMWId2",
};

function createRepository(): AuthStore {
  const tokens = new Map<string, AuthRefreshToken>();
  return {
    findUserByEmail: async (email) => (email === user.email ? user : null),
    findUserById: async (id) => (id === user.id ? user : null),
    findRefreshTokenByHash: async (tokenHash) => tokens.get(tokenHash) ?? null,
    createRefreshToken: async (record) => {
      tokens.set(record.tokenHash, { ...record, id: record.tokenHash });
    },
    deleteRefreshTokenByHash: async (tokenHash) => {
      tokens.delete(tokenHash);
    },
  };
}

function createService() {
  return new AuthService(
    createRepository(),
    {
      jwtSecret: "a secure secret that contains at least thirty-two characters",
      jwtAccessTokenTtlSeconds: 900,
    },
    7 * 24 * 60 * 60,
  );
}

describe("AuthService", () => {
  it("returns a token pair for the seeded root credentials", async () => {
    const result = await createService().login({
      email: "root@root.com",
      password: "root@root.com",
    });

    expect(result.user).toEqual({ id: user.id, username: "root", email: "root@root.com" });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an incorrect password without exposing which credential failed", async () => {
    await expect(
      createService().login({ email: "root@root.com", password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password" });
  });

  it("rotates a refresh token and rejects the consumed token", async () => {
    const service = createService();
    const login = await service.login({ email: "root@root.com", password: "root@root.com" });

    const refreshed = await service.refresh({ refreshToken: login.refreshToken });

    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    await expect(service.refresh({ refreshToken: login.refreshToken })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
