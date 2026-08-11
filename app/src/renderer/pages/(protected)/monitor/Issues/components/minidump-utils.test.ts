import { describe, expect, it } from "vitest";

import { formatBytes } from "./minidump-utils";

describe("formatBytes", () => {
  it("formats dump sizes using binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(12 * 1024)).toBe("12.0 KiB");
    expect(formatBytes(1_100_004)).toBe("1.05 MiB");
  });
});
