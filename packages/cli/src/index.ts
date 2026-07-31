#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { cac, type CAC } from "cac";

import { authCommand } from "./commands/auth.js";
import { configCommand } from "./commands/config.js";
import { issueCommand } from "./commands/issue.js";
import { projectCommand } from "./commands/project.js";
import { sourcemapCommand } from "./commands/sourcemap.js";
import { AuthCancelledError, AuthRequiredError } from "./lib/auth.js";
import { setConfigOverrides } from "./lib/config.js";

export function createCli(): CAC {
  const cli = cac("traceability");
  cli
    .usage("<command> [options]")
    .option("--server <url>", "server URL override")
    .version("1.0.0")
    .help();

  authCommand(cli);
  configCommand(cli);
  projectCommand(cli);
  issueCommand(cli);
  sourcemapCommand(cli);
  return cli;
}

export async function runCli(argv = process.argv): Promise<void> {
  const cli = createCli();
  cli.parse(argv, { run: false });
  setConfigOverrides({
    server: typeof cli.options.server === "string" ? cli.options.server : undefined,
  });
  if (!cli.matchedCommand) {
    if (cli.args[0]) throw new Error(`Unknown command: ${cli.args[0]}`);
    cli.outputHelp();
    return;
  }
  await cli.runMatchedCommand();
}

function reportError(err: unknown): void {
  if (err instanceof AuthCancelledError) {
    console.error("Aborted.");
    process.exitCode = 130;
    return;
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode =
    err instanceof AuthRequiredError || (err instanceof Error && err.name === "CACError") ? 2 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli().catch(reportError);
}
