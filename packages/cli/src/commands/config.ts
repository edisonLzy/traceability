import { Command } from "commander";

import { getConfig, saveConfig } from "../lib/config.js";

export function configCommand(program: Command): void {
  const cmd = program.command("config").description("manage CLI server configuration");
  cmd
    .command("set")
    .requiredOption("--server <url>", "server URL")
    .action((opts: { server: string }) => {
      saveConfig({ ...getConfig(), server: opts.server });
      console.log("Saved server configuration.");
    });
  cmd.command("show").action(() => {
    console.log(`server: ${getConfig().server}`);
  });
}
