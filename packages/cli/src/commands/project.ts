import { Command } from "commander";

import { printJson, printTable } from "../lib/output.js";
import { getTrpcClient } from "../lib/trpc.js";

interface ProjectListOptions {
  json?: boolean;
}

interface ProjectCreateOptions {
  slug: string;
  name: string;
  json?: boolean;
}

interface ProjectUpdateOptions {
  name?: string;
  enabled?: string;
  json?: boolean;
}

export function projectCommand(program: Command): void {
  const cmd = program.command("project").description("manage projects");

  cmd
    .command("list")
    .option("--json", "output JSON")
    .action(async (opts: ProjectListOptions) => {
      const client = await getTrpcClient();
      const projects = await client.projects.list.query();
      if (opts.json) printJson(projects);
      else {
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
    .requiredOption("--slug <slug>", "project slug")
    .requiredOption("--name <name>", "project name")
    .option("--json", "output JSON")
    .action(async (opts: ProjectCreateOptions) => {
      const client = await getTrpcClient();
      const project = await client.projects.create.mutate({
        slug: opts.slug,
        name: opts.name,
        platform: "javascript",
      });
      if (opts.json) printJson(project);
      else
        console.log(
          `Created project ${project.project.id} (${project.project.slug})\nDSN: ${project.dsn}`,
        );
    });

  cmd
    .command("show <projectId>")
    .option("--json", "output JSON")
    .action(async (projectId: string, _opts: ProjectListOptions) => {
      const client = await getTrpcClient();
      const [project, connections] = await Promise.all([
        client.projects.get.query(projectId),
        client.projects.listConnections.query(projectId),
      ]);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      printJson({ project, connections: connections ?? [] });
    });

  cmd
    .command("update <projectId>")
    .option("--name <name>", "project name")
    .option("--enabled <boolean>", "whether the project is enabled")
    .option("--json", "output JSON")
    .action(async (projectId: string, opts: ProjectUpdateOptions) => {
      if (!opts.name && opts.enabled === undefined) {
        throw new Error("Provide --name or --enabled.");
      }
      if (opts.enabled !== undefined && opts.enabled !== "true" && opts.enabled !== "false") {
        throw new Error("--enabled must be true or false");
      }
      const client = await getTrpcClient();
      const project = await client.projects.update.mutate({
        projectId,
        patch: {
          ...(opts.name ? { name: opts.name } : {}),
          ...(opts.enabled === undefined ? {} : { enabled: opts.enabled === "true" }),
        },
      });
      if (!project) throw new Error(`Project not found: ${projectId}`);
      printJson(project);
    });

  cmd.command("remove <projectId>").action(async (projectId: string) => {
    const client = await getTrpcClient();
    const project = await client.projects.remove.mutate(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    console.log(`Removed project ${project.slug}.`);
  });
}
