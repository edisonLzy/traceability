import { Type } from "@earendil-works/pi-ai";

import { createMainTrpcClient } from "../../../../main/trpc/client.js";
import { defineMainExtension } from "../../../core/main/index.js";
import { PROJECTS_EXTENSION } from "../common/extension.js";
import { PROJECTS_LIST_BLOCK, PROJECTS_LIST_TOOL } from "../common/types.js";

const client = createMainTrpcClient();

export default defineMainExtension({
  ...PROJECTS_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register(PROJECTS_LIST_BLOCK);
    ctx.systemPrompt.register({
      id: "projects.prompt",
      content: `Use ${PROJECTS_LIST_TOOL} only when you need project records for reasoning or a text answer. For an interactive project list, call render_ui with type "projects.list" and props {} without calling ${PROJECTS_LIST_TOOL} first.`,
    });

    ctx.tools.register({
      name: PROJECTS_LIST_TOOL,
      label: "List Projects",
      description: "List all Traceability projects.",
      executionMode: "sequential",
      parameters: Type.Object({}),
      async execute() {
        const projects = await client.projects.list.query();
        return {
          content: [{ type: "text", text: summarizeProjects(projects) }],
          details: {},
        };
      },
    });
  },
});

function summarizeProjects(
  projects: Awaited<ReturnType<typeof client.projects.list.query>>,
): string {
  if (projects.length === 0) return "No Traceability projects found.";
  return projects
    .map((project) => `- ${project.name} (${project.slug}) - ${project.id}`)
    .join("\n");
}
