import { Type } from "@earendil-works/pi-ai";

import { createMainTrpcClient } from "../../../../main/trpc-client.js";
import { formatAssistantBlockFence } from "../../../core/common/index.js";
import { defineMainExtension } from "../../../core/main/index.js";
import { PROJECTS_EXTENSION } from "../common/extension.js";
import { PROJECTS_LIST_BLOCK_TYPE, PROJECTS_LIST_TOOL } from "../common/types.js";

const client = createMainTrpcClient();

export default defineMainExtension({
  ...PROJECTS_EXTENSION,
  setup(ctx) {
    ctx.systemPrompt.register({
      id: "projects.prompt",
      content: `Use the ${PROJECTS_LIST_TOOL} tool to list the user's Traceability projects when they ask about their projects or when you need to know which projects exist.

After calling ${PROJECTS_LIST_TOOL}, present the result as an interactive card by emitting a fenced ${PROJECTS_LIST_BLOCK_TYPE} agent-block in your reply. The fence body is JSON with the exact props the card expects. Example:

${formatAssistantBlockFence({
  type: PROJECTS_LIST_BLOCK_TYPE,
  props: {
    projects: [
      {
        id: "<project-id>",
        slug: "checkout-web",
        name: "Checkout Web",
        platform: "javascript",
        enabled: true,
      },
    ],
  },
})}`,
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
          details: {
            type: "monitor.projects.runtime",
            assistantBlock: { type: PROJECTS_LIST_BLOCK_TYPE, props: { projects } },
          },
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
