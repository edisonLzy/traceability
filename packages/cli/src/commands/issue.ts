import type { CAC } from "cac";

import { printJson, printTable } from "../lib/output.js";
import { getTrpcClient } from "../lib/trpc.js";

interface IssueOptions {
  projectId?: string;
  limit?: string;
  json?: boolean;
}

export function issueCommand(cli: CAC): void {
  cli
    .command("issue <action> [issueId]", "list and inspect issues")
    .option("--project-id <id>", "project ID")
    .option("--limit <n>", "max results", { default: "20" })
    .option("--json", "output JSON")
    .allowUnknownOptions()
    .action(async (action: string, issueId: string | undefined, opts: IssueOptions) => {
      if (["fix-request", "attach-patch", "mark-fixed"].includes(action)) {
        console.error(`${action} is not available on this server (v1).`);
        process.exitCode = 2;
        return;
      }
      const client = await getTrpcClient();
      switch (action) {
        case "list": {
          if (!opts.projectId) throw new Error("issue list requires --project-id <id>");
          const result = await client.issues.list.query({
            projectId: opts.projectId,
            limit: Number(opts.limit ?? "20"),
          });
          if (opts.json) printJson(result);
          else {
            printTable(result.data, [
              { key: "id", label: "ID", width: 36 },
              { key: "title", label: "TITLE", width: 40 },
              { key: "status", label: "STATUS", width: 12 },
              { key: "eventCount", label: "EVENTS", width: 8 },
            ]);
          }
          return;
        }
        case "show": {
          if (!issueId) throw new Error("issue show requires <issueId>");
          const issue = await client.issues.get.query(issueId);
          if (!issue) throw new Error(`Issue not found: ${issueId}`);
          printJson(issue);
          return;
        }
        default:
          throw new Error(`Unknown issue action: ${action}`);
      }
    });
}
