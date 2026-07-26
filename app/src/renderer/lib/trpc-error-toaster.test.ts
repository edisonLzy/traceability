import { describe, expect, it } from "vitest";

import { formatTrpcError } from "./trpc-error-toaster";

describe("formatTrpcError", () => {
  it("uses an actionable message for authentication failures", () => {
    expect(formatTrpcError({ data: { code: "UNAUTHORIZED" } })).toContain("认证失败");
  });

  it("falls back when the server does not provide a message", () => {
    expect(formatTrpcError({ data: { code: "INTERNAL_SERVER_ERROR" } })).toBe("服务请求失败。");
  });
});
