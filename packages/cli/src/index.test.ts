import { CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgram, reportError } from "./index.js";
import { AuthRequiredError } from "./lib/auth.js";

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

async function captureHelp(args: string[]): Promise<string> {
  const program = createProgram();
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "traceability", ...args]);
  } catch (err) {
    // --help 在 exitOverride 下抛 exitCode 0 的 CommanderError,不算失败
    if (!(err instanceof CommanderError && err.exitCode === 0)) throw err;
  }
  return write.mock.calls.map((call) => String(call[0])).join("");
}

const subcommandCases: Array<[string, string[]]> = [
  ["auth", ["login", "status", "logout"]],
  ["config", ["set", "show"]],
  ["project", ["list", "create", "show", "update", "remove"]],
  ["issue", ["list", "show", "fix-request", "attach-patch", "mark-fixed"]],
  ["sourcemap", ["upload"]],
];

describe("CLI help output", () => {
  it("lists every command in the top-level help without an Actions section", async () => {
    const output = await captureHelp(["--help"]);

    expect(output).toContain("Commands:");
    for (const name of ["auth", "config", "project", "issue", "sourcemap"]) {
      expect(output).toContain(name);
    }
    expect(output).not.toContain("Actions:");
  });

  it.each(subcommandCases)("lists the %s leaf subcommands in its help", async (command, leaves) => {
    const output = await captureHelp([command, "--help"]);

    for (const leaf of leaves) expect(output).toContain(leaf);
    expect(output).not.toContain("Actions:");
  });

  it("prints the subcommand help only once for project --help", async () => {
    const output = await captureHelp(["project", "--help"]);

    expect(output.match(/Usage:/g)).toHaveLength(1);
    // 父命令 help 列出子命令,但不会重复打印顶层 Commands
    expect(output.match(/manage projects/g)).toHaveLength(1);
  });

  it("rejects project with no subcommand", async () => {
    const program = createProgram();
    await expect(program.parseAsync(["node", "traceability", "project"])).rejects.toMatchObject({
      name: "CommanderError",
      code: "commander.help",
    });
  });
});

describe("error reporting", () => {
  it("turns fetch network failures into an actionable server hint", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.TRACEABILITY_SERVER_URL = "http://unreachable.example:9";

    reportError(new TypeError("fetch failed"));

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Cannot reach server: http://unreachable.example:9"),
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining("traceability config set --server"));
    expect(process.exitCode).toBe(1);
    delete process.env.TRACEABILITY_SERVER_URL;
  });

  it("prints a reason when authentication is required", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportError(new AuthRequiredError());

    expect(error).toHaveBeenCalledWith("authentication required. Run: traceability auth login");
    expect(process.exitCode).toBe(2);
  });
});
