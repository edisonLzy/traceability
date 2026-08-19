import "@xyflow/react/dist/style.css";
import { projectStore } from "@renderer/store/project";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "zustand";

import type {
  ExplorerFlowEdge,
  ExplorerFlowNode,
  ExplorerGraphSnapshot,
  GraphOperation,
} from "../types";
import { ExplorerGraphNodeCard } from "./_components/ExplorerGraphNodeCard";
import { ExplorerGraphRealtimeStatus } from "./_components/ExplorerGraphRealtimeStatus";
import { ExplorerNodeDetailPanel } from "./_components/ExplorerNodeDetailPanel";
import { useApplyGraphOperations } from "./_hooks/use-apply-graph-operations";
import { useExplorerGraphRealtime } from "./_hooks/use-explorer-graph-realtime";
import { useExplorerGraphState } from "./_hooks/use-explorer-graph-state";

const nodeTypes = {
  // Every server node type uses the same card renderer. The node type controls
  // the card's icon, copy, accent color, and metadata inside ExplorerGraphNodeCard.
  question: ExplorerGraphNodeCard,
  finding: ExplorerGraphNodeCard,
  issue: ExplorerGraphNodeCard,
  event: ExplorerGraphNodeCard,
  replay: ExplorerGraphNodeCard,
  code: ExplorerGraphNodeCard,
  document: ExplorerGraphNodeCard,
};

export function ExplorerGraphDetailPage() {
  const { graphId } = useParams<{ graphId: string }>();
  const project = useStore(projectStore, (state) => state.currentProject);

  if (!project || !graphId) {
    return <div className="p-6 text-[12px] text-tertiary">Graph context is unavailable.</div>;
  }

  return <ExplorerCanvas graphId={graphId} projectId={project.id} />;
}

function ExplorerCanvas({ projectId, graphId }: { projectId: string; graphId: string }) {
  const state = useExplorerGraphState(projectId, graphId);
  const realtime = useExplorerGraphRealtime({
    projectId,
    graphId,
    state,
    enabled: Boolean(projectId && graphId && state.snapshot),
  });
  const { applyOperations } = useApplyGraphOperations({ projectId, graphId, state });
  const [nodes, setNodes, onNodesChange] = useNodesState<ExplorerFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ExplorerFlowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!state.snapshot) return;
    setNodes(state.snapshot.nodes.map(toFlowNode));
    setEdges(state.snapshot.edges.map(toFlowEdge));
  }, [state.snapshot, setEdges, setNodes]);

  const moveNode = useCallback<OnNodeDrag<ExplorerFlowNode>>(
    async (_event, node) => {
      try {
        await applyOperations([
          { op: "moveNodes", positions: [{ id: node.id, position: node.position }] },
        ]);
      } catch {
        // The operations hook resynchronizes and reports the mutation error.
      }
    },
    [applyOperations],
  );

  const deleteNodes = useCallback<OnNodesDelete<ExplorerFlowNode>>(
    async (deleted) => {
      if (deleted.length === 0) return;
      try {
        await applyOperations(
          deleted.map((node): GraphOperation => ({ op: "deleteNode", id: node.id })),
        );
        setSelectedNodeId(null);
      } catch {
        // The operations hook resynchronizes and reports the mutation error.
      }
    },
    [applyOperations],
  );

  const deleteEdges = useCallback<OnEdgesDelete<ExplorerFlowEdge>>(
    async (deleted) => {
      if (deleted.length === 0) return;
      try {
        await applyOperations(
          deleted.map((edge): GraphOperation => ({ op: "deleteEdge", id: edge.id })),
        );
      } catch {
        // The operations hook resynchronizes and reports the mutation error.
      }
    },
    [applyOperations],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectNode = useCallback((nodeId: string) => setSelectedNodeId(nodeId), []);
  const clearSelectedNode = useCallback(() => setSelectedNodeId(null), []);

  if (state.isLoading) {
    return (
      <div className="flex h-full min-h-[620px] items-center justify-center text-[11px] text-tertiary">
        Loading graph…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="m-5 rounded-[10px] border border-danger/20 bg-danger/5 p-3 text-[11px] text-danger">
        Unable to load graph: {state.error.message}
      </div>
    );
  }

  return (
    <div className="p-2 h-full">
      <div className="explorer-graph-canvas relative h-full overflow-hidden rounded-[14px] border border-hairline bg-canvas/70">
        <ExplorerGraphRealtimeStatus realtime={realtime} />

        <ReactFlow
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_event, node) => selectNode(node.id)}
          onPaneClick={clearSelectedNode}
          onNodeDragStop={moveNode}
          onNodesDelete={deleteNodes}
          onEdgesDelete={deleteEdges}
          defaultEdgeOptions={{ type: "smoothstep", animated: false }}
          colorMode="system"
          deleteKeyCode={["Backspace", "Delete"]}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            color="var(--hairline-strong)"
            gap={24}
            size={1.2}
            variant={BackgroundVariant.Dots}
          />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            className="!border-hairline !bg-surface-glass-elevated"
            nodeColor={getMiniMapNodeColor}
            nodeStrokeColor="var(--hairline-strong)"
            position="bottom-right"
          />
        </ReactFlow>

        {selectedNode ? (
          <ExplorerNodeDetailPanel
            graphId={graphId}
            onClose={clearSelectedNode}
            selectedNode={selectedNode}
          />
        ) : null}
      </div>
    </div>
  );
}

function toFlowNode(node: ExplorerGraphSnapshot["nodes"][number]): ExplorerFlowNode {
  return { ...node, type: node.type } as ExplorerFlowNode;
}

function toFlowEdge(edge: ExplorerGraphSnapshot["edges"][number]): ExplorerFlowEdge {
  return {
    ...edge,
    type: "smoothstep",
    label: edge.data.relation.replaceAll("_", " "),
    labelBgBorderRadius: 6,
    labelBgPadding: [6, 3],
    labelBgStyle: {
      fill: "var(--surface-glass-elevated)",
      stroke: "var(--hairline)",
      strokeWidth: 1,
    },
    labelStyle: {
      fill: "var(--tertiary)",
      fontSize: 9,
      fontWeight: 650,
    },
    style: {
      stroke: "color-mix(in srgb, var(--primary) 46%, var(--hairline-strong))",
      strokeWidth: 1.75,
    },
  } as ExplorerFlowEdge;
}

function getMiniMapNodeColor(node: Node) {
  switch (node.type) {
    case "finding":
      return "var(--success)";
    case "issue":
      return "var(--danger)";
    case "event":
      return "var(--info)";
    case "document":
      return "var(--warning)";
    default:
      return "var(--primary)";
  }
}
