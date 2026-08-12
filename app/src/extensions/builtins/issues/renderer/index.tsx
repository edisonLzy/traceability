import { Card } from "@renderer/components/ui/card";
import { useIssues } from "@renderer/hooks/use-issues";
import { cn, relativeTime, statusGroup, statusLabel } from "@renderer/lib/utils";
import { projectStore } from "@renderer/store/project";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";

import { defineRendererExtension, type AssistantBlockRenderProps } from "../../../core/renderer";
import { ISSUES_EXTENSION } from "../common/extension";
import { ISSUES_LIST_BLOCK, type IssuesListBlockProps } from "../common/types";

export function IssuesListBlock({ props }: AssistantBlockRenderProps<IssuesListBlockProps>) {
  const navigate = useNavigate();
  const currentProjectId = useStore(projectStore, (state) => state.currentProject?.id ?? "");
  const projectId = props.projectId ?? currentProjectId;
  const { data, error, isLoading } = useIssues({ projectId, limit: props.limit });
  const issues = (data?.data ?? []).filter(
    (issue) => props.status === "all" || statusGroup(issue.status) === props.status,
  );

  return (
    <Card className="not-prose my-2 bg-white/[0.03] text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-muted">
        <span className="font-[620]">Issues</span>
        <span className="text-tertiary">{isLoading ? "…" : issues.length}</span>
      </div>
      <div className="border-t border-hairline p-1">
        {!projectId ? <BlockState tone="error">No current project is available.</BlockState> : null}
        {isLoading ? <BlockState>Loading issues…</BlockState> : null}
        {error ? (
          <BlockState tone="error">Could not load issues: {error.message}</BlockState>
        ) : null}
        {projectId && !isLoading && !error && issues.length === 0 ? (
          <BlockState>No issues match these filters.</BlockState>
        ) : null}
        {issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => navigate(`/monitor/issues/${issue.id}`)}
            className="flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                issue.type === "error" ? "bg-danger" : "bg-warning",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[10px] font-[610]">{issue.title}</span>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  {statusLabel(issue.status)}
                </span>
              </div>
              <div className="truncate text-[9px] text-muted-foreground">
                x{issue.eventCount} · {relativeTime(issue.lastSeen.toString())}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

export default defineRendererExtension({
  ...ISSUES_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register({ definition: ISSUES_LIST_BLOCK, render: IssuesListBlock });
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
