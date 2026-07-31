import { cac } from "cac";
import { afterEach, describe, expect, it, vi } from "vitest";

import { issueCommand } from "./issue.js";

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("unsupported issue fix-loop commands", () => {
  it.each(["fix-request", "attach-patch", "mark-fixed"])(
    "%s returns exit code 2 with an explanation",
    async (action) => {
      const cli = cac("traceability");
      issueCommand(cli);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      cli.parse(["node", "traceability", "issue", action, "issue-1"], { run: false });
      await cli.runMatchedCommand();

      expect(process.exitCode).toBe(2);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("not available"));
    },
  );
});
