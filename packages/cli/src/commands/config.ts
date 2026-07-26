import { Command } from "commander";

import { saveConfig, getConfig } from "../lib/config.js";

export function configCommand(program: Command): void {
  const cmd = program.command("config").description("CLI configuration");
  cmd
    .command("set")
    .requiredOption("--server <url>")
    .requiredOption("--token <token>")
    .action((opts) => {
      saveConfig({ server: opts.server, token: opts.token });
      console.log("Saved.");
    });
  cmd.command("show").action(() => {
    const cfg = getConfig();
    console.log(`server: ${cfg.server}`);
    console.log(`token:  ${cfg.token ? `${cfg.token.slice(0, 4)}…` : "(empty)"}`);
  });
}
