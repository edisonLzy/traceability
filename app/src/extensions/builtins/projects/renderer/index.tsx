import { Card } from "@renderer/components/ui/card";
import { trpc } from "@renderer/lib/trpc";

import { defineRendererExtension, type AssistantBlockRenderProps } from "../../../core/renderer";
import { PROJECTS_EXTENSION } from "../common/extension";
import { PROJECTS_LIST_BLOCK, type ProjectsListBlockProps } from "../common/types";

export function ProjectsListBlock(_props: AssistantBlockRenderProps<ProjectsListBlockProps>) {
  const {
    data: projects = [],
    error,
    isLoading,
  } = trpc.projects.list.useQuery(undefined, {
    staleTime: 30_000,
  });

  return (
    <Card className="not-prose my-2 bg-surface-glass text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-muted">
        <span className="font-[620]">Projects</span>
        <span className="text-tertiary">{isLoading ? "…" : projects.length}</span>
      </div>
      <div className="border-t border-hairline p-1">
        {isLoading ? <BlockState>Loading projects…</BlockState> : null}
        {error ? (
          <BlockState tone="error">Could not load projects: {error.message}</BlockState>
        ) : null}
        {!isLoading && !error && projects.length === 0 ? (
          <BlockState>No Traceability projects found.</BlockState>
        ) : null}
        {projects.map((project) => (
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
    ctx.assistantBlocks.register({ definition: PROJECTS_LIST_BLOCK, render: ProjectsListBlock });
  },
});

function BlockState({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "error" | "muted";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "px-2 py-3 text-[10px] text-danger"
          : "px-2 py-3 text-[10px] text-tertiary"
      }
    >
      {children}
    </div>
  );
}
