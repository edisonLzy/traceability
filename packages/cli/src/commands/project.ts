import type { CAC } from "cac";

import { printJson, printTable } from "../lib/output.js";
import { getTrpcClient } from "../lib/trpc.js";

interface ProjectOptions {
  slug?: string;
  name?: string;
  enabled?: string;
  json?: boolean;
}

export function projectCommand(cli: CAC): void {
  cli
    .command("project <action> [projectId]", "manage projects")
    .option("--slug <slug>", "project slug")
    .option("--name <name>", "project name")
    .option("--enabled <boolean>", "whether the project is enabled")
    .option("--json", "output JSON")
    .action(async (action: string, projectId: string | undefined, opts: ProjectOptions) => {
      const client = await getTrpcClient();
      switch (action) {
        case "list": {
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
          return;
        }
        case "create": {
          if (!opts.slug || !opts.name)
            throw new Error("project create requires --slug and --name");
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
          return;
        }
        case "show": {
          const id = requireProjectId(action, projectId);
          const [project, connections] = await Promise.all([
            client.projects.get.query(id),
            client.projects.listConnections.query(id),
          ]);
          if (!project) throw new Error(`Project not found: ${id}`);
          printJson({ project, connections: connections ?? [] });
          return;
        }
        case "dsn": {
          const id = requireProjectId(action, projectId);
          const connections = await client.projects.listConnections.query(id);
          if (!connections) throw new Error(`Project not found: ${id}`);
          printJson({ projectId: id, connections });
          return;
        }
        case "update": {
          const id = requireProjectId(action, projectId);
          if (!opts.name && opts.enabled === undefined) {
            throw new Error("Provide --name or --enabled.");
          }
          if (opts.enabled !== undefined && opts.enabled !== "true" && opts.enabled !== "false") {
            throw new Error("--enabled must be true or false");
          }
          const project = await client.projects.update.mutate({
            projectId: id,
            patch: {
              ...(opts.name ? { name: opts.name } : {}),
              ...(opts.enabled === undefined ? {} : { enabled: opts.enabled === "true" }),
            },
          });
          if (!project) throw new Error(`Project not found: ${id}`);
          printJson(project);
          return;
        }
        case "remove": {
          const id = requireProjectId(action, projectId);
          const project = await client.projects.remove.mutate(id);
          if (!project) throw new Error(`Project not found: ${id}`);
          console.log(`Removed project ${project.slug}.`);
          return;
        }
        default:
          throw new Error(`Unknown project action: ${action}`);
      }
    });
}

function requireProjectId(action: string, projectId: string | undefined): string {
  if (!projectId) throw new Error(`project ${action} requires <projectId>`);
  return projectId;
}
