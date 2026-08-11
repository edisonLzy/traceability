import { authStore } from "@renderer/store/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticatedFetch } from "./trpc";

describe("authenticatedFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    authStore.setState({
      state: "unauthenticated",
      accessToken: null,
      refreshToken: null,
    });
  });

  it("adds the current access token to direct API requests", async () => {
    authStore.setState({ accessToken: "access-token" });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(authenticatedFetch("http://localhost/minidump")).resolves.toMatchObject({
      status: 200,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
