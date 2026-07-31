import { describe, expect, it } from "vitest";

import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
} from "../auth.js";

const config = {
  jwtSecret: "a secure secret that contains at least thirty-two characters",
  jwtAccessTokenTtlSeconds: 900,
};

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "root",
  email: "root@root.com",
};

describe("auth token service", () => {
  it("returns the authenticated user from a valid access token", () => {
    expect(verifyAccessToken(createAccessToken(user, config), config)).toEqual(user);
  });

  it("rejects a token signed with a different secret", () => {
    const issuer = {
      jwtSecret: "issuer secret that contains at least thirty-two characters",
      jwtAccessTokenTtlSeconds: 900,
    };
    const verifier = {
      jwtSecret: "verifier secret that contains at least thirty two characters",
      jwtAccessTokenTtlSeconds: 900,
    };

    expect(verifyAccessToken(createAccessToken(user, issuer), verifier)).toBeNull();
  });

  it("generates refresh tokens whose hashes do not reveal the token", () => {
    const refreshToken = createRefreshToken();

    expect(refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRefreshToken(refreshToken)).toHaveLength(64);
    expect(hashRefreshToken(refreshToken)).not.toBe(refreshToken);
  });
});
