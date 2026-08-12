import { Type } from "@earendil-works/pi-ai";

import { createMainTrpcClient } from "../../../../main/trpc/client.js";
import type { Issue } from "../../../../shared/trpc-types.js";
import { defineMainExtension } from "../../../core/main/index.js";
import type { MainExtensionContext } from "../../../core/main/index.js";
import { ISSUES_EXTENSION } from "../common/extension.js";
import { ISSUES_GET_TOOL, ISSUES_LIST_BLOCK, ISSUES_LIST_TOOL } from "../common/types.js";

const client = createMainTrpcClient();

export default defineMainExtension({
  ...ISSUES_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register(ISSUES_LIST_BLOCK);
    ctx.systemPrompt.register({
      id: "issues.prompt",
      content: `Use ${ISSUES_LIST_TOOL} when you need issue records for reasoning or a text answer and ${ISSUES_GET_TOOL} to fetch one issue. For an interactive issue list, call render_ui with type "issues.list" and lightweight query props; the component loads its own data, so do not call ${ISSUES_LIST_TOOL} first.`,
    });

    ctx.tools.register({
      name: ISSUES_LIST_TOOL,
      label: "List Issues",
      description: "List issues for a Traceability project.",
      executionMode: "sequential",
      parameters: Type.Object({
        projectId: Type.Optional(Type.String({ description: "Project ID." })),
        status: Type.Optional(Type.String({ description: "unresolved | resolved | ignored" })),
        limit: Type.Optional(Type.Number({ description: "Max issues to return." })),
      }),
      async execute(_toolCallId, args) {
        const projectId =
          typeof args.projectId === "string" && args.projectId
            ? args.projectId
            : await resolveProjectId(ctx);
        const result = await client.issues.list.query({
          projectId,
          limit: args.limit ?? 20,
        });
        const status = typeof args.status === "string" ? args.status : undefined;
        const issues = status
          ? result.data.filter((issue) => issue.status === status)
          : result.data;
        return {
          content: [{ type: "text", text: summarizeIssues(issues) }],
          details: {},
        };
      },
    });

    ctx.tools.register({
      name: ISSUES_GET_TOOL,
      label: "Get Issue Detail",
      description: "Get a single issue's full detail by ID.",
      executionMode: "sequential",
      parameters: Type.Object({ issueId: Type.String({ description: "Issue ID." }) }),
      async execute(_toolCallId, args) {
        const issue = await client.issues.get.query(args.issueId);
        if (!issue) throw new Error("Issue not found.");
        return {
          content: [{ type: "text", text: summarizeIssue(issue) }],
          details: { type: "monitor.issue.detail" },
        };
      },
    });
  },
});

async function resolveProjectId(ctx: MainExtensionContext): Promise<string> {
  const projects = await client.projects.list.query();
  if (projects.length === 0) throw new Error("No Traceability projects found.");
  if (projects.length === 1) return projects[0]!.id;

  const result = await ctx.extensionRuntime.askUserQuestion({
    questions: [
      {
        header: "Select project",
        question: "Which project's issues do you want to view?",
        options: projects.map((project) => ({ label: project.name, description: project.id })),
      },
    ],
  });
  const selected = result.answers[0]?.selectedOptions[0];
  const project = projects.find((item) => item.name === selected);
  if (!project) throw new Error("No project selected.");
  return project.id;
}

function summarizeIssues(issues: Issue[]): string {
  if (issues.length === 0) return "No issues found.";
  return issues
    .map(
      (issue) =>
        `- ${issue.title} [${issue.status}] (x${issue.eventCount}, last ${issue.lastSeen}) - ${issue.id}`,
    )
    .join("\n");
}

function summarizeIssue(issue: Issue): string {
  return [
    `# ${issue.title}`,
    `ID: ${issue.id}`,
    `Project: ${issue.projectId}`,
    `Type: ${issue.type}`,
    `Status: ${issue.status}`,
    `Count: ${issue.eventCount}`,
    `First seen: ${issue.firstSeen}`,
    `Last seen: ${issue.lastSeen}`,
  ].join("\n");
}
