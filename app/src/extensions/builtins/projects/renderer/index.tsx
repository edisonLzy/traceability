import { Card } from "@renderer/components/ui/card";

import { defineRendererExtension } from "../../../core/renderer";
import { PROJECTS_EXTENSION } from "../common/extension";
import { PROJECTS_LIST_BLOCK_TYPE, type ProjectsListBlockProps } from "../common/types";

function ProjectsListBlock({ props }: { props: Record<string, unknown> }) {
  const block = parseProjectsProps(props);
  if (!block) return null;

  return (
    <Card className="not-prose my-2 bg-white/[0.03] text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-muted">
        <span className="font-[620]">Projects</span>
        <span className="text-tertiary">{block.projects.length}</span>
      </div>
      <div className="border-t border-hairline p-1">
        {block.projects.map((project) => (
          <div
            key={project.id}
            className="flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] font-[610]">{project.name}</div>
              <div className="truncate text-[9px] text-muted-foreground">
                {project.slug} · {project.id}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default defineRendererExtension({
  ...PROJECTS_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register({ type: PROJECTS_LIST_BLOCK_TYPE, render: ProjectsListBlock });
  },
});

function parseProjectsProps(value: Record<string, unknown>): ProjectsListBlockProps | null {
  if (!Array.isArray(value.projects)) return null;
  return {
    projects: value.projects.filter(isRecord).flatMap((item) => {
      if (
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.slug !== "string" ||
        typeof item.platform !== "string"
      ) {
        return [];
      }
      return [
        {
          id: item.id,
          organizationId: typeof item.organizationId === "string" ? item.organizationId : "",
          sentryProjectId: typeof item.sentryProjectId === "number" ? item.sentryProjectId : 0,
          slug: item.slug,
          name: item.name,
          platform: item.platform,
          enabled: item.enabled !== false,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
        },
      ];
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
