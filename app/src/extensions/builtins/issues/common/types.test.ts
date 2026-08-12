import { describe, expect, expectTypeOf, it } from "vitest";

import type { IssuesListBlockProps } from "./types";
import { IssuesListBlockPropsSchema } from "./types";

describe("IssuesListBlockPropsSchema", () => {
  it("applies query defaults and strips historical data snapshots", () => {
    expect(
      IssuesListBlockPropsSchema.parse({
        issues: [{ id: "stale-issue" }],
      }),
    ).toEqual({ status: "all", limit: 20 });
  });

  it("rejects invalid query props", () => {
    expect(() => IssuesListBlockPropsSchema.parse({ limit: 101 })).toThrow();
    expect(() => IssuesListBlockPropsSchema.parse({ status: "open" })).toThrow();
    expect(() => IssuesListBlockPropsSchema.parse({ projectId: "not-a-uuid" })).toThrow();
  });

  it("infers renderer props from the registered Zod schema", () => {
    expectTypeOf<IssuesListBlockProps>().toEqualTypeOf<{
      projectId?: string;
      status: "all" | "unresolved" | "resolved" | "ignored";
      limit: number;
    }>();
  });
});
