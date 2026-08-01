import { Command } from "commander";

import { printJson, printTable } from "../lib/output.js";
import { getTrpcClient } from "../lib/trpc.js";

interface IssueListOptions {
  projectId: string;
  limit?: string;
  json?: boolean;
}

export function issueCommand(program: Command): void {
  const cmd = program.command("issue").description("list and inspect issues");

  cmd
    .command("list")
    .requiredOption("--project-id <id>", "project ID")
    .option("--limit <n>", "max results", "20")
    .option("--json", "output JSON")
    .action(async (opts: IssueListOptions) => {
      const client = await getTrpcClient();
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
    });

  cmd
    .command("show <issueId>")
    .option("--json", "output JSON")
    .action(async (issueId: string, _opts: { json?: boolean }) => {
      const client = await getTrpcClient();
      const issue = await client.issues.get.query(issueId);
      if (!issue) throw new Error(`Issue not found: ${issueId}`);
      printJson(issue);
    });

  for (const action of ["fix-request", "attach-patch", "mark-fixed"]) {
    cmd
      .command(`${action} <issueId>`)
      .allowUnknownOption()
      .action(() => {
        console.error(`${action} is not available on this server (v1).`);
        process.exitCode = 2;
      });
  }
}
