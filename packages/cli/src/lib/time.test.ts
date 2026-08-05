import { afterEach, describe, expect, it, vi } from "vitest";

import { parseTimeRange } from "./time.js";

afterEach(() => vi.useRealTimers());

describe("parseTimeRange", () => {
  it("resolves relative durations to now minus the duration", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));

    expect(parseTimeRange("1h", undefined)).toEqual({
      from: new Date("2026-08-05T11:00:00Z"),
      to: undefined,
    });
    expect(parseTimeRange("30m", "7d")).toEqual({
      from: new Date("2026-08-05T11:30:00Z"),
      to: new Date("2026-07-29T12:00:00Z"),
    });
  });

  it("passes ISO timestamps through", () => {
    expect(parseTimeRange("2026-08-01T00:00:00Z", undefined)).toEqual({
      from: new Date("2026-08-01T00:00:00Z"),
      to: undefined,
    });
  });

  it("returns undefined when both flags are absent", () => {
    expect(parseTimeRange()).toEqual({ from: undefined, to: undefined });
  });

  it("throws on invalid values, naming the flag", () => {
    expect(() => parseTimeRange("bogus")).toThrow("--from");
    expect(() => parseTimeRange(undefined, "yesterday")).toThrow("--to");
  });
});
