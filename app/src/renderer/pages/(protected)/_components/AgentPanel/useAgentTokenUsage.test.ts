import type { Usage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import { calculateEntryTokenUsage } from "./useAgentTokenUsage";

const firstCall: Usage = {
  input: 10,
  output: 20,
  cacheRead: 3,
  cacheWrite: 4,
  totalTokens: 37,
  cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
};

const secondCall: Usage = {
  input: 5,
  output: 6,
  cacheRead: 7,
  cacheWrite: 8,
  totalTokens: 26,
  cost: { input: 5, output: 6, cacheRead: 7, cacheWrite: 8, total: 26 },
};

describe("calculateEntryTokenUsage", () => {
  it("preserves the latest call while accumulating one visible assistant turn", () => {
    const first = calculateEntryTokenUsage(undefined, firstCall);
    const result = calculateEntryTokenUsage(first, secondCall);

    expect(result.latestCall).toEqual(secondCall);
    expect(result.turn).toEqual({
      input: 15,
      output: 26,
      cacheRead: 10,
      cacheWrite: 12,
      totalTokens: 63,
      cost: { input: 6, output: 8, cacheRead: 10, cacheWrite: 12, total: 36 },
    });
  });
});
