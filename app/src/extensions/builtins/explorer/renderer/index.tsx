import { Card } from "@renderer/components/ui/card";
import { ExternalLink, Network } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { defineRendererExtension } from "../../../core/renderer";
import { EXPLORER_EXTENSION } from "../common/extension";
import {
  EXPLORER_GRAPH_CREATED_BLOCK_TYPE,
  EXPLORER_GRAPH_LIST_BLOCK_TYPE,
  EXPLORER_NODE_LIST_BLOCK_TYPE,
  type ExplorerGraphCreatedBlockProps,
  type ExplorerGraphListBlockProps,
  type ExplorerNodeListBlockProps,
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

function ExplorerGraphListBlock({ props }: { props: Record<string, unknown> }) {
  const navigate = useNavigate();
  const block = parseGraphListProps(props);
  if (!block) return null;

  return (
    <Card className="not-prose my-2 border-primary/20 bg-primary/[0.06] text-card-foreground">
      <div className="flex items-center gap-2 border-b border-primary/15 px-2.5 py-2">
        <span className="grid size-6 place-items-center rounded-[7px] bg-primary/10 text-primary-hover">
          <Network className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-[650] text-ink">
            {block.graphs.length} Explorer Graph{block.graphs.length === 1 ? "" : "s"}
          </div>
          <div className="truncate text-[9px] text-tertiary">project {block.projectId}</div>
        </div>
      </div>
      <div className="flex flex-col">
        {block.graphs.map((graph) => (
          <button
            className="flex items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-primary/[0.06]"
            key={graph.id}
            onClick={() => navigate(`/explorer/${graph.id}`)}
            type="button"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-[620] text-ink">{graph.title}</div>
              <div className="truncate font-mono text-[9px] text-tertiary">{graph.id}</div>
            </div>
            <span className="shrink-0 font-mono text-[9px] text-tertiary">
              {graph.nodeCount} nodes · {graph.edgeCount} edges
            </span>
            <ExternalLink className="size-3 shrink-0 text-tertiary" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function ExplorerNodeListBlock({ props }: { props: Record<string, unknown> }) {
  const navigate = useNavigate();
  const block = parseNodeListProps(props);
  if (!block) return null;

  return (
    <Card className="not-prose my-2 border-primary/20 bg-primary/[0.06] text-card-foreground">
      <div className="flex items-center gap-2 border-b border-primary/15 px-2.5 py-2">
        <span className="grid size-6 place-items-center rounded-[7px] bg-primary/10 text-primary-hover">
          <Network className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-[650] text-ink">
            {block.nodes.length} node{block.nodes.length === 1 ? "" : "s"}
          </div>
          <div className="truncate text-[9px] text-tertiary">{block.title}</div>
        </div>
      </div>
      <div className="flex flex-col">
        {block.nodes.map((node) => (
          <button
            className="flex items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-primary/[0.06]"
            key={node.id}
            onClick={() => navigate(`/explorer/${block.graphId}`)}
            type="button"
          >
            <span className="shrink-0 rounded-[5px] border border-primary/15 bg-primary/10 px-1.5 py-0.5 font-mono text-[8px] text-primary-hover">
              {node.type}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-ink">{node.label || node.id}</div>
              <div className="truncate font-mono text-[9px] text-tertiary">{node.id}</div>
            </div>
            <ExternalLink className="size-3 shrink-0 text-tertiary" />
          </button>
        ))}
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
    ctx.assistantBlocks.register({
      type: EXPLORER_GRAPH_LIST_BLOCK_TYPE,
      render: ExplorerGraphListBlock,
    });
    ctx.assistantBlocks.register({
      type: EXPLORER_NODE_LIST_BLOCK_TYPE,
      render: ExplorerNodeListBlock,
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

function parseGraphListProps(value: Record<string, unknown>): ExplorerGraphListBlockProps | null {
  if (typeof value.projectId !== "string" || !Array.isArray(value.graphs)) return null;
  const graphs = value.graphs
    .filter(isGraphListRow)
    .map(({ id, title, status, version, nodeCount, edgeCount }) => ({
      id,
      title,
      status,
      version,
      nodeCount,
      edgeCount,
    }));
  return { projectId: value.projectId, graphs };
}

function isGraphListRow(value: unknown): value is ExplorerGraphListBlockProps["graphs"][number] {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.status === "string" &&
    typeof row.version === "number" &&
    typeof row.nodeCount === "number" &&
    typeof row.edgeCount === "number"
  );
}

function parseNodeListProps(value: Record<string, unknown>): ExplorerNodeListBlockProps | null {
  if (
    typeof value.projectId !== "string" ||
    typeof value.graphId !== "string" ||
    typeof value.title !== "string" ||
    !Array.isArray(value.nodes)
  )
    return null;
  const nodes = value.nodes
    .filter(isNodeListRow)
    .map(({ id, type, label }) => ({ id, type, label }));
  return { projectId: value.projectId, graphId: value.graphId, title: value.title, nodes };
}

function isNodeListRow(value: unknown): value is ExplorerNodeListBlockProps["nodes"][number] {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" && typeof row.type === "string" && typeof row.label === "string"
  );
}
