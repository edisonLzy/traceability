#!/usr/bin/env node
import { Command } from "commander";

import { configCommand } from "./commands/config.js";
import { issueCommand } from "./commands/issue.js";
import { projectCommand } from "./commands/project.js";
import { sourcemapCommand } from "./commands/sourcemap.js";
import { setConfigOverrides } from "./lib/config.js";

const program = new Command();
program
  .name("traceability")
  .description("Traceability CLI")
  .version("1.0.0")
  .option("--server <url>", "server URL override")
  .option("--token <token>", "management token override");

program.hook("preAction", (command) => {
  const options = command.optsWithGlobals() as { server?: string; token?: string };
  setConfigOverrides({ server: options.server, token: options.token });
});

configCommand(program);
projectCommand(program);
issueCommand(program);
sourcemapCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  const code =
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    typeof err.data === "object" &&
    err.data !== null &&
    "code" in err.data &&
    err.data.code === "UNAUTHORIZED"
      ? 2
      : 1;
  process.exitCode = code;
});
