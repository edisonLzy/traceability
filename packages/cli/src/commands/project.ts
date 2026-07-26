import { Command } from "commander";

import { printJson, printTable } from "../lib/output.js";
import { getTrpcClient } from "../lib/trpc.js";

export function projectCommand(program: Command): void {
  const cmd = program.command("project").description("manage projects");
  addProjectSubcommands(cmd);

  // Keep the old command as a deprecation alias for one minor release.
  const legacy = program.command("app").description("deprecated alias for project");
  legacy.hook("preAction", () => {
    console.error("Warning: `traceability app` is deprecated; use `traceability project`.");
  });
  addProjectSubcommands(legacy);
}

function addProjectSubcommands(cmd: Command): void {
  cmd
    .command("list")
    .option("--json", "output JSON")
    .action(async (opts) => {
      const projects = await getTrpcClient().projects.list.query();
      if (opts.json) {
        printJson(projects);
      } else {
        printTable(projects, [
          { key: "id", label: "ID", width: 36 },
          { key: "slug", label: "SLUG", width: 20 },
          { key: "name", label: "NAME", width: 24 },
          { key: "enabled", label: "ENABLED", width: 8 },
        ]);
      }
    });

  cmd
    .command("create")
    .requiredOption("--slug <slug>")
    .requiredOption("--name <name>")
    .option("--json", "output JSON")
    .action(async (opts) => {
      const project = await getTrpcClient().projects.create.mutate({
        slug: opts.slug,
        name: opts.name,
        platform: "javascript",
      });
      if (opts.json) {
        printJson(project);
      } else {
        console.log(`Created project ${project.project.id} (${project.project.slug})`);
      }
    });

  cmd
    .command("show <projectId>")
    .option("--json", "output JSON")
    .action(async (projectId) => {
      const project = await getTrpcClient().projects.get.query(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      printJson(project);
    });

  cmd
    .command("update <projectId>")
    .option("--name <name>")
    .option("--enabled <boolean>")
    .option("--json", "output JSON")
    .action(async (projectId, opts) => {
      if (!opts.name && opts.enabled === undefined) {
        throw new Error("Provide --name or --enabled.");
      }
      const project = await getTrpcClient().projects.update.mutate({
        projectId,
        patch: {
          ...(opts.name ? { name: opts.name } : {}),
          ...(opts.enabled === undefined ? {} : { enabled: opts.enabled === "true" }),
        },
      });
      if (!project) throw new Error(`Project not found: ${projectId}`);
      printJson(project);
    });

  cmd.command("remove <projectId>").action(async (projectId) => {
    const project = await getTrpcClient().projects.remove.mutate(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    console.log(`Removed project ${project.slug}.`);
  });
}
