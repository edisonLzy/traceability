import { Card } from "@renderer/components/ui/card";
import {
  CheckCircleIcon,
  CircleIcon,
  LoaderCircleIcon,
  OctagonXIcon,
  XCircleIcon,
} from "lucide-react";

import { defineRendererExtension } from "../../../core/renderer";
import { SUBAGENTS_EXTENSION } from "../common/extension";
import {
  SUBAGENTS_LIST_BLOCK_TYPE,
  type SubagentsListBlockProps,
  type SubagentStatus,
} from "../common/types";

function SubagentsListBlock({ props }: { props: Record<string, unknown> }) {
  const block = parseListBlockProps(props);

  if (!block) {
    return null;
  }

  return (
    <Card className="not-prose my-2 bg-surface-glass text-card-foreground">
      <div className="flex min-h-8 items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-muted">
        <span className="font-[620]">Subagents</span>
        <span className="text-tertiary">{block.subagents.length} tasks</span>
      </div>
      <div className="border-t border-hairline p-1">
        {block.subagents.map((subagent) => {
          const status = subagent.status;
          const StatusIcon = getStatusIcon(status);
          return (
            <div
              key={subagent.id}
              className="flex w-full items-center gap-2 rounded-[8px] px-1.5 py-1.5 text-left transition-colors hover:bg-overlay-strong"
            >
              <StatusIcon
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground",
                  status === "running" && "animate-spin",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[10px] font-[610]">{subagent.name}</span>
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {getStatusLabel(status)}
                  </span>
                </div>
                <div className="truncate text-[9px] text-muted-foreground">
                  {subagent.phase || subagent.task}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default defineRendererExtension({
  ...SUBAGENTS_EXTENSION,
  setup(ctx) {
    ctx.slashCommands.register({
      id: "subagents.run",
      group: "Skills",
      name: "subagent",
      description: "Use subagents to run focused tasks in parallel",
      extra: "Parallel agents",
      run({ editor, range }) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent(
            "Use subagents to run this in parallel. Split the work into focused subagents, call subagents_run, then merge their findings into one final answer.\n\nTask: ",
          )
          .run();
      },
    });

    ctx.assistantBlocks.register({
      type: SUBAGENTS_LIST_BLOCK_TYPE,
      render: SubagentsListBlock,
    });
  },
});

function parseListBlockProps(value: Record<string, unknown>): SubagentsListBlockProps | null {
  if (typeof value.parentSessionId !== "string" || !Array.isArray(value.subagents)) {
    return null;
  }

  return {
    parentSessionId: value.parentSessionId,
    runId: typeof value.runId === "string" ? value.runId : "",
    subagents: value.subagents.filter(isRecord).flatMap((item) => {
      if (
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.task !== "string" ||
        !isSubagentStatus(item.status)
      ) {
        return [];
      }

      return [
        {
          id: item.id,
          model: parseModel(item.model),
          name: item.name,
          phase: typeof item.phase === "string" ? item.phase : undefined,
          status: item.status,
          task: item.task,
        },
      ];
    }),
  };
}

function parseModel(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.modelId !== "string" || typeof value.providerId !== "string") {
    return undefined;
  }

  return {
    modelId: value.modelId,
    providerId: value.providerId,
  };
}

function getStatusIcon(status: SubagentStatus) {
  switch (status) {
    case "aborted":
      return OctagonXIcon;
    case "completed":
      return CheckCircleIcon;
    case "failed":
      return XCircleIcon;
    case "running":
      return LoaderCircleIcon;
    case "queued":
      return CircleIcon;
  }
}

function getStatusLabel(status: SubagentStatus) {
  switch (status) {
    case "aborted":
      return "Aborted";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    case "queued":
      return "Queued";
  }
}

function isSubagentStatus(value: unknown): value is SubagentStatus {
  return (
    value === "aborted" ||
    value === "completed" ||
    value === "failed" ||
    value === "queued" ||
    value === "running"
  );
}

function cn(...values: Array<false | null | string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
