import { describe, expect, it, vi } from "vitest";

import { authRouter } from "./router.js";

describe("authRouter", () => {
  it("keeps login public and delegates validated credentials to the auth service", async () => {
    const login = vi.fn(async () => ({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        username: "root",
        email: "root@root.com",
      },
      accessToken: "access",
      refreshToken: "refresh",
    }));
    const caller = authRouter.createCaller({ container: { auth: { login } } } as never);

    await expect(
      caller.login({ email: "root@root.com", password: "root@root.com" }),
    ).resolves.toEqual({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        username: "root",
        email: "root@root.com",
      },
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(login).toHaveBeenCalledWith({ email: "root@root.com", password: "root@root.com" });
  });
});
