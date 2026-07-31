import { describe, expect, it } from "vitest";

import { formatTrpcError } from "./TrpcErrorToaster";

describe("formatTrpcError", () => {
  it("returns a password/email error for UNAUTHORIZED (login flow)", () => {
    expect(formatTrpcError({ data: { code: "UNAUTHORIZED" } })).toContain("邮箱或密码不正确。");
  });

  it("returns a param error for BAD_REQUEST", () => {
    expect(formatTrpcError({ data: { code: "BAD_REQUEST" } })).toBe("请求参数有误。");
  });

  it("returns a network error when the message mentions fetch and data is absent", () => {
    expect(formatTrpcError({ message: "TypeError: Failed to fetch" })).toBe(
      "网络连接失败，请检查服务器是否启动。",
    );
  });

  it("falls back to the error message when present", () => {
    expect(formatTrpcError({ message: "Something went wrong" })).toBe("Something went wrong");
  });

  it("falls back to a generic message when nothing is provided", () => {
    expect(formatTrpcError({ data: { code: "INTERNAL_SERVER_ERROR" } })).toBe("服务请求失败。");
  });
});
