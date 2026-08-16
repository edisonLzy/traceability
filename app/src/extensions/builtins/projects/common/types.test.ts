import { describe, expect, it } from "vitest";

import { ProjectsListBlockPropsSchema } from "./types";

describe("ProjectsListBlockPropsSchema", () => {
  it("accepts empty props and strips historical data snapshots", () => {
    expect(
      ProjectsListBlockPropsSchema.parse({
        projects: [{ id: "stale-project" }],
      }),
    ).toEqual({});
  });
});
