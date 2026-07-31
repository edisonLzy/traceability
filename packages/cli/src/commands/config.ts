import type { CAC } from "cac";

import { getConfig, saveConfig } from "../lib/config.js";

interface ConfigOptions {
  server?: string;
}

export function configCommand(cli: CAC): void {
  cli
    .command("config <action>", "manage CLI server configuration")
    .option("--server <url>", "server URL")
    .action((action: string, options: ConfigOptions) => {
      switch (action) {
        case "set": {
          if (!options.server) throw new Error("config set requires --server <url>");
          saveConfig({ ...getConfig(), server: options.server });
          console.log("Saved server configuration.");
          return;
        }
        case "show": {
          console.log(`server: ${getConfig().server}`);
          return;
        }
        default:
          throw new Error(`Unknown config action: ${action}`);
      }
    });
}
