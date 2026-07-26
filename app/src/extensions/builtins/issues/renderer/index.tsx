import { Card } from "@renderer/components/ui/card";
import { cn, relativeTime, statusLabel } from "@renderer/lib/utils";
import { useNavigate } from "react-router-dom";

import type { Issue } from "../../../../shared/trpc-types.js";
import { defineRendererExtension } from "../../../core/renderer";
import { ISSUES_EXTENSION } from "../common/extension";
import { ISSUES_LIST_BLOCK_TYPE, type IssuesListBlockProps } from "../common/types";

function IssuesListBlock({ props }: { props: Record<string, unknown> }) {
  const navigate = useNavigate();
  const block = parseIssuesProps(props);
  if (!block) return null;

  return (
    <Card className="not-prose my-2 bg-white/[0.03] text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-muted">
        <span className="font-[620]">Issues</span>
        <span className="text-tertiary">{block.issues.length}</span>
      </div>
      <div className="border-t border-hairline p-1">
        {block.issues.map((issue) => (
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
    ctx.assistantBlocks.register({ type: ISSUES_LIST_BLOCK_TYPE, render: IssuesListBlock });
  },
});

function parseIssuesProps(value: Record<string, unknown>): IssuesListBlockProps | null {
  if (!Array.isArray(value.issues) || typeof value.projectId !== "string") return null;
  return {
    projectId: value.projectId,
    nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : null,
    issues: value.issues.filter(isRecord).flatMap((item) => {
      if (
        typeof item.id !== "string" ||
        typeof item.projectId !== "string" ||
        typeof item.title !== "string" ||
        typeof item.type !== "string" ||
        typeof item.status !== "string"
      ) {
        return [];
      }
      return [
        {
          id: item.id,
          projectId: item.projectId,
          fingerprint: typeof item.fingerprint === "string" ? item.fingerprint : "",
          groupingVersion: typeof item.groupingVersion === "number" ? item.groupingVersion : 1,
          title: item.title,
          type: item.type,
          status: item.status,
          firstSeen: typeof item.firstSeen === "string" ? item.firstSeen : "",
          lastSeen: typeof item.lastSeen === "string" ? item.lastSeen : "",
          eventCount: typeof item.eventCount === "number" ? item.eventCount : 0,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
        } as Issue,
      ];
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
