import { Command } from "commander";
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
      const program = new Command().exitOverride();
      issueCommand(program);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await program.parseAsync(["node", "traceability", "issue", action, "issue-1"]);

      expect(process.exitCode).toBe(2);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("not available"));
    },
  );
});
