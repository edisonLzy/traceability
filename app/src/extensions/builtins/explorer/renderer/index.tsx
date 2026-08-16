import { Card } from "@renderer/components/ui/card";
import { ExternalLink, Network } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { defineRendererExtension } from "../../../core/renderer";
import { EXPLORER_EXTENSION } from "../common/extension";
import {
  EXPLORER_GRAPH_CREATED_BLOCK_TYPE,
  type ExplorerGraphCreatedBlockProps,
} from "../common/types";

function ExplorerGraphCreatedBlock({ props }: { props: Record<string, unknown> }) {
  const navigate = useNavigate();
  const block = parseProps(props);
  if (!block) return null;

  return (
    <Card className="not-prose my-2 border-primary/20 bg-primary/[0.06] text-card-foreground">
      <div className="flex items-center gap-2 border-b border-primary/15 px-2.5 py-2">
        <span className="grid size-6 place-items-center rounded-[7px] bg-primary/10 text-primary-hover">
          <Network className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-[650] text-ink">Explorer Graph created</div>
          <div className="truncate text-[9px] text-tertiary">
            {block.title} · Version {block.version}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="font-mono text-[9px] text-tertiary">{block.graphId}</span>
        <button
          className="button primary min-h-7 px-2.5 text-[10px]"
          onClick={() => navigate(`/explorer/${block.graphId}`)}
          type="button"
        >
          <ExternalLink className="size-3" /> Open graph
        </button>
      </div>
    </Card>
  );
}

export default defineRendererExtension({
  ...EXPLORER_EXTENSION,
  setup(ctx) {
    ctx.assistantBlocks.register({
      type: EXPLORER_GRAPH_CREATED_BLOCK_TYPE,
      render: ExplorerGraphCreatedBlock,
    });
  },
});

function parseProps(value: Record<string, unknown>): ExplorerGraphCreatedBlockProps | null {
  if (
    typeof value.projectId !== "string" ||
    typeof value.graphId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.version !== "number"
  )
    return null;
  return {
    projectId: value.projectId,
    graphId: value.graphId,
    title: value.title,
    version: value.version,
    nodeCount: typeof value.nodeCount === "number" ? value.nodeCount : undefined,
    edgeCount: typeof value.edgeCount === "number" ? value.edgeCount : undefined,
  };
}
