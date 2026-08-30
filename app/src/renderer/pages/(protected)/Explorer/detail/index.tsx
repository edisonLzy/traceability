import "@xyflow/react/dist/style.css";
import { Button } from "@renderer/components/ui/button";
import { projectStore } from "@renderer/store/project";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  type Node,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { Sparkles, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "zustand";

import type {
  ExplorerFlowEdge,
  ExplorerFlowNode,
  ExplorerGraphSnapshot,
  GraphOperation,
} from "../types";
import { ExplorerGraphEdge } from "./_components/ExplorerGraphEdge";
import { ExplorerGraphNodeCard } from "./_components/ExplorerGraphNodeCard";
import { ExplorerGraphNodeDetail } from "./_components/ExplorerGraphNodeDetail";
import { ExplorerGraphRealtimeStatus } from "./_components/ExplorerGraphRealtimeStatus";
import { useApplyGraphOperations } from "./_hooks/use-apply-graph-operations";
import { useExplorerGraphRealtime } from "./_hooks/use-explorer-graph-realtime";
import { useExplorerGraphState } from "./_hooks/use-explorer-graph-state";
import { getHorizontalTreeLayout, isGraphOverlapping } from "./_utils/layout";

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

const edgeTypes = {
  explorerEdge: ExplorerGraphEdge,
  smoothstep: ExplorerGraphEdge,
};

export function ExplorerGraphDetailPage() {
  const { graphId } = useParams<{ graphId: string }>();
  const project = useStore(projectStore, (state) => state.currentProject);

  if (!project || !graphId) {
    return (
      <div className="p-6 font-mono text-[11px] text-tertiary">Graph context is unavailable.</div>
    );
  }

  return (
    <ReactFlowProvider>
      <ExplorerCanvas graphId={graphId} projectId={project.id} />
    </ReactFlowProvider>
  );
}

function ExplorerCanvas({ projectId, graphId }: { projectId: string; graphId: string }) {
  const { fitView } = useReactFlow();
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
  const initialAutoLayoutAppliedRef = useRef(false);
  const applyOperationsRef = useRef(applyOperations);
  applyOperationsRef.current = applyOperations;

  // Synchronize from snapshot and auto-layout if initial nodes are overlapping
  useEffect(() => {
    if (!state.snapshot) return;

    let snapshotNodes = state.snapshot.nodes.map(toFlowNode);
    const snapshotEdges = state.snapshot.edges.map(toFlowEdge);

    // Auto-organize overlapping nodes on initial load (e.g. newly created graph from agent)
    if (
      !initialAutoLayoutAppliedRef.current &&
      snapshotNodes.length > 1 &&
      isGraphOverlapping(snapshotNodes)
    ) {
      initialAutoLayoutAppliedRef.current = true;
      snapshotNodes = getHorizontalTreeLayout(snapshotNodes, snapshotEdges);

      // Persist the tidy tree positions back to server in background
      const moveOps: GraphOperation[] = [
        {
          op: "moveNodes",
          positions: snapshotNodes.map((n) => ({ id: n.id, position: n.position })),
        },
      ];
      void applyOperationsRef.current(moveOps).catch(() => {});
    }

    setNodes(snapshotNodes);
    setEdges(snapshotEdges);
  }, [state.snapshot, setEdges, setNodes]);

  // Handle manual "Auto Layout" request
  const handleAutoLayout = useCallback(async () => {
    if (nodes.length === 0) return;

    const layoutedNodes = getHorizontalTreeLayout(nodes, edges);
    setNodes(layoutedNodes);

    try {
      await applyOperations([
        {
          op: "moveNodes",
          positions: layoutedNodes.map((node) => ({
            id: node.id,
            position: node.position,
          })),
        },
      ]);
      setTimeout(() => {
        fitView({ padding: 0.25, duration: 300 });
      }, 50);
      toast.success("Horizontal tree layout applied");
    } catch {
      toast.error("Failed to save layout positions");
    }
  }, [applyOperations, edges, fitView, nodes, setNodes]);

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

  const displayEdges = useMemo(() => {
    if (!selectedNodeId) return edges;
    return edges.map((edge) => {
      const isConnected = edge.source === selectedNodeId || edge.target === selectedNodeId;
      return isConnected ? { ...edge, selected: true } : edge;
    });
  }, [edges, selectedNodeId]);

  if (state.isLoading) {
    return (
      <div className="flex h-full min-h-[620px] items-center justify-center font-mono text-[11px] text-tertiary">
        Loading graph…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="m-5 rounded-[6px] border-2 border-danger/40 bg-danger/10 p-3 font-mono text-[11px] text-danger shadow-[2px_2px_0_var(--ink)]">
        Unable to load graph: {state.error.message}
      </div>
    );
  }

  return (
    <div className="p-2 h-full">
      <div className="explorer-graph-canvas relative h-full overflow-hidden rounded-[8px] border-2 border-border bg-canvas/90">
        <ExplorerGraphRealtimeStatus realtime={realtime} />

        <ReactFlow
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_event, node) => selectNode(node.id)}
          onPaneClick={clearSelectedNode}
          onNodeDragStop={moveNode}
          onNodesDelete={deleteNodes}
          onEdgesDelete={deleteEdges}
          defaultEdgeOptions={{ type: "explorerEdge" }}
          colorMode="system"
          deleteKeyCode={["Backspace", "Delete"]}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          {/* Neo-Brutalist Canvas Toolbar Panel */}
          <Panel className="m-3 flex items-center gap-2" position="top-left">
            <Button
              className="border-2 border-ink bg-card text-ink shadow-[2px_2px_0_var(--ink)] hover:translate-x-px hover:translate-y-px hover:shadow-none font-mono font-bold text-[10px] uppercase tracking-wider transition-all"
              onClick={handleAutoLayout}
              size="sm"
              title="Organize into Left-to-Right tree layout"
              type="button"
              variant="default"
            >
              <Sparkles className="size-3.5 text-primary-hover" />
              Auto Tree Layout
            </Button>
            <Button
              className="border-2 border-ink bg-card text-ink shadow-[2px_2px_0_var(--ink)] hover:translate-x-px hover:translate-y-px hover:shadow-none font-mono font-bold text-[10px] uppercase tracking-wider transition-all"
              onClick={() => fitView({ padding: 0.2, duration: 300 })}
              size="sm"
              title="Fit graph into view"
              type="button"
              variant="default"
            >
              <ZoomIn className="size-3.5" />
              Fit
            </Button>
            <div className="flex items-center gap-1.5 rounded-[4px] border-2 border-ink bg-card px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground shadow-[2px_2px_0_var(--ink)]">
              <span>{nodes.length} nodes</span>
              <span>·</span>
              <span>{edges.length} edges</span>
            </div>
          </Panel>

          <Background
            color="var(--hairline-strong)"
            gap={20}
            size={1.5}
            variant={BackgroundVariant.Dots}
          />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            className="!border-2 !border-ink !bg-card !rounded-[6px] !shadow-[3px_3px_0_var(--ink)]"
            nodeColor={getMiniMapNodeColor}
            nodeStrokeColor="var(--ink)"
            position="bottom-right"
          />
        </ReactFlow>

        {selectedNode ? (
          <ExplorerGraphNodeDetail
            edges={edges}
            graphId={graphId}
            nodes={nodes}
            onClose={clearSelectedNode}
            onSelectNode={selectNode}
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
    type: "explorerEdge",
    label: edge.data.relation.replaceAll("_", " "),
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "var(--ink)",
      width: 14,
      height: 14,
    },
  } as ExplorerFlowEdge;
}

function getMiniMapNodeColor(node: Node) {
  switch (node.type) {
    case "question":
      return "var(--signal-yellow)";
    case "finding":
      return "var(--signal-green)";
    case "issue":
      return "var(--signal-pink)";
    case "event":
      return "var(--signal-cyan)";
    case "replay":
    case "code":
      return "var(--signal-purple)";
    case "document":
      return "var(--signal-yellow)";
    default:
      return "var(--primary)";
  }
}
