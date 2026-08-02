import { spawn } from "node:child_process";
import { basename } from "node:path";

import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import type { AppTool } from "./types.js";

const TerminalParams = Type.Object({
  command: Type.String({ description: "The read-only shell command to execute" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the command" })),
});

// Hardcoded read-only policy. This tool only ever executes commands that pass
// `evaluateReadonlyCommand`; anything that could mutate state is rejected
// up-front with no user prompt. Loosen this by editing the sets below - do not
// add a blanket "allow" path.
const READONLY_COMMANDS = new Set<string>([
  "ls",
  "cat",
  "head",
  "tail",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "find",
  "fd",
  "wc",
  "file",
  "tree",
  "pwd",
  "which",
  "whereis",
  "echo",
  "printf",
  "stat",
  "du",
  "df",
  "ps",
  "uname",
  "whoami",
  "id",
  "date",
  "diff",
  "comm",
  "sort",
  "uniq",
  "cut",
  "tr",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "rev",
  "tac",
  "nl",
  "od",
  "hexdump",
  "xxd",
  "strings",
  "seq",
  "env",
  "printenv",
  "true",
  "false",
  "test",
]);

// `git` is allowlisted per-subcommand so mutating commands (push, reset, clean,
// checkout, commit, rm, ...) are rejected even though `git` itself reads fine.
const GIT_READONLY_SUBCOMMANDS = new Set<string>([
  "status",
  "log",
  "diff",
  "show",
  "ls-files",
  "ls-tree",
  "blame",
  "remote",
  "rev-parse",
  "describe",
  "reflog",
  "shortlog",
  "for-each-ref",
  "name-rev",
]);

// Shell constructs that can smuggle a second command or write to the filesystem.
// `&` also covers `&&`; `|` (pipe) is intentionally allowed and each piped
// segment is re-checked against the allowlist.
const WRITE_OPERATORS = [">", "<", "||", ";", "&", "`", "$("];

// `find` is read-only by default but has exec/delete/write-to-file actions.
const FIND_WRITE_ACTIONS = /(^|\s)-(exec|execdir|ok|okdir|delete|fls|fprint|fprintf)(=|\s|$)/;

const TIMEOUT_MS = 30_000;

export function evaluateReadonlyCommand(
  command: string,
): { allowed: true } | { allowed: false; reason: string } {
  // Newlines/carriage returns act as command separators in `sh -c`; reject so
  // a multi-line payload can't bypass the single-command allowlist.
  if (/[\n\r]/.test(command)) {
    return { allowed: false, reason: "command must be a single line" };
  }

  for (const op of WRITE_OPERATORS) {
    if (command.includes(op)) {
      const label = op === "`" ? "backtick" : op;
      return { allowed: false, reason: `command contains write-capable operator "${label}"` };
    }
  }

  for (const raw of command.split("|")) {
    const segment = raw.trim();
    if (!segment) continue;

    const tokens = segment.split(/\s+/);
    const name = basename(tokens[0] ?? "");

    if (name === "git") {
      const subcommand = tokens[1] ?? "";
      if (!GIT_READONLY_SUBCOMMANDS.has(subcommand)) {
        return { allowed: false, reason: `git subcommand "${subcommand}" is not read-only` };
      }
      continue;
    }

    if (name === "find") {
      if (FIND_WRITE_ACTIONS.test(segment)) {
        return { allowed: false, reason: "find exec/delete/write actions are not allowed" };
      }
      continue;
    }

    if (!READONLY_COMMANDS.has(name)) {
      return { allowed: false, reason: `command "${name}" is not in the read-only allowlist` };
    }
  }

  return { allowed: true };
}

export const terminalCreateTool: AppTool<typeof TerminalParams> = {
  name: "terminal_create",
  label: "Run Terminal Command",
  description:
    "Execute a read-only shell command on the local machine to inspect the repository and environment. " +
    "Use it to search code (`rg`, `grep`), list files (`ls`, `find`, `tree`), inspect git state " +
    "(`git status`, `git log`, `git diff`), and read file snippets (`cat`, `head`, `tail`). " +
    "Only read-only commands are permitted; write/exec operations (redirects, `rm`, `git push`, " +
    "`find -exec`, command chaining, etc.) are rejected. Pass `cwd` to set the working directory " +
    "(use the repository root). stdout is returned as text (stderr if stdout is empty).",
  riskLevel: "medium",
  parameters: TerminalParams,
  async execute(toolCallId, params) {
    const { command, cwd } = params as Static<typeof TerminalParams>;

    const verdict = evaluateReadonlyCommand(command);
    if (!verdict.allowed) {
      return {
        content: [
          { type: "text", text: `Error: Command rejected by read-only policy: ${verdict.reason}` },
        ],
        details: { toolCallId, blocked: true, reason: verdict.reason },
      };
    }

    try {
      const [stdout, stderr, exitCode, timedOut] = await new Promise<
        [string, string, number, boolean]
      >((resolve, reject) => {
        const proc = spawn("sh", ["-c", command], { cwd: cwd ?? process.cwd() });

        let out = "";
        let err = "";
        let didTimeOut = false;

        const timer = setTimeout(() => {
          didTimeOut = true;
          proc.kill("SIGTERM");
        }, TIMEOUT_MS);

        proc.stdout.on("data", (chunk: Buffer) => {
          out += chunk.toString();
        });
        proc.stderr.on("data", (chunk: Buffer) => {
          err += chunk.toString();
        });

        proc.on("close", (code) => {
          clearTimeout(timer);
          resolve([out, err, code ?? 0, didTimeOut]);
        });
        proc.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });

      if (timedOut) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Command timed out after ${TIMEOUT_MS}ms.\nPartial stdout:\n${stdout}\nPartial stderr:\n${stderr}`,
            },
          ],
          details: { toolCallId, timedOut: true },
        };
      }

      const output = stdout || stderr || "(no output)";

      return {
        content: [{ type: "text", text: exitCode === 0 ? output : `Exit ${exitCode}: ${output}` }],
        details: { toolCallId, exitCode },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        details: { toolCallId },
      };
    }
  },
};
