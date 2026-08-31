import { useSharedPromptEditor } from "@extensions/core/renderer";
import { Button } from "@renderer/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@renderer/components/ui/dialog";
import { cn } from "@renderer/lib/utils";
import { ArrowDownRight, ArrowUpRight, Check, Copy, Sparkles, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ExplorerFlowEdge, ExplorerFlowNode, ExplorerNodeData } from "../../types";
import { getNodeDescription, getNodeTitle, nodeIcon } from "./ExplorerGraphNodeCard";
import { BrowserNodeDetailContent } from "./NodeDetailContent/BrowserNodeDetailContent";
import { CodeNodeDetailContent } from "./NodeDetailContent/CodeNodeDetailContent";
import { YoutubeNodeDetailContent } from "./NodeDetailContent/YoutubeNodeDetailContent";

export interface ExplorerGraphNodeDetailProps {
  graphId: string;
  onClose: () => void;
  selectedNode: ExplorerFlowNode;
  nodes?: ExplorerFlowNode[];
  edges?: ExplorerFlowEdge[];
  onSelectNode?: (nodeId: string) => void;
}

export function ExplorerGraphNodeDetail({
  graphId,
  onClose,
  selectedNode,
  nodes = [],
  edges = [],
  onSelectNode,
}: ExplorerGraphNodeDetailProps) {
  const sharedPromptEditor = useSharedPromptEditor();
  const [copiedId, setCopiedId] = useState(false);

  const continueFromNode = useCallback(() => {
    const editor = sharedPromptEditor.editor;
    if (!editor) {
      toast("Open Agent Panel to continue this investigation");
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent(
        `/explorer-graph-create Continue from graph ${graphId} / node ${selectedNode.id} `,
      )
      .run();
    toast.success("Graph and Node IDs added to Agent Panel");
  }, [graphId, selectedNode.id, sharedPromptEditor.editor]);

  const copyNodeId = useCallback(() => {
    void navigator.clipboard.writeText(selectedNode.id);
    setCopiedId(true);
    toast.success("Node ID copied to clipboard");
    setTimeout(() => setCopiedId(false), 2000);
  }, [selectedNode.id]);

  // Compute graph evidence topology: inbound & outbound relations
  const { inboundRelations, outboundRelations } = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const inbound = edges
      .filter((edge) => edge.target === selectedNode.id)
      .map((edge) => ({
        edge,
        sourceNode: nodeMap.get(edge.source),
      }))
      .filter((item): item is { edge: ExplorerFlowEdge; sourceNode: ExplorerFlowNode } =>
        Boolean(item.sourceNode),
      );

    const outbound = edges
      .filter((edge) => edge.source === selectedNode.id)
      .map((edge) => ({
        edge,
        targetNode: nodeMap.get(edge.target),
      }))
      .filter((item): item is { edge: ExplorerFlowEdge; targetNode: ExplorerFlowNode } =>
        Boolean(item.targetNode),
      );

    return { inboundRelations: inbound, outboundRelations: outbound };
  }, [edges, nodes, selectedNode.id]);

  const title = getNodeTitle(selectedNode.data);
  const nodeType = selectedNode.type || "finding";

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={Boolean(selectedNode)}
    >
      <DialogContent
        backdropClassName="bg-black/45 backdrop-blur-[6px]"
        className="w-[96vw] max-w-[1440px] h-[92vh] max-h-[960px] p-0 gap-0 border-2 border-ink bg-card shadow-[8px_8px_0_var(--ink)] rounded-[8px] !flex !flex-col overflow-hidden"
        showCloseButton={false}
      >
        {/* Top Accent Strip */}
        <div
          className="h-1.5 w-full shrink-0"
          style={{ backgroundColor: getNodeAccentColor(nodeType) }}
        />

        {/* Modal Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b-2 border-ink bg-muted/25 px-4 sm:px-5">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-[4px] border-1.5 border-ink font-mono text-[13px] font-bold text-ink shadow-[1.5px_1.5px_0_var(--ink)]"
              style={{ backgroundColor: getNodeAccentColor(nodeType) }}
            >
              {nodeIcon(nodeType)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle
                  className="truncate font-heading text-[13px] font-bold text-ink"
                  title={title}
                >
                  {title}
                </DialogTitle>
                <span className="shrink-0 rounded-[3px] border border-ink bg-card px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-ink">
                  {nodeType}
                </span>
              </div>
              <p className="font-mono text-[9.5px] text-muted-foreground truncate">
                ID: {selectedNode.id} · ({Math.round(selectedNode.position.x)},{" "}
                {Math.round(selectedNode.position.y)})
              </p>
            </div>
          </div>

          <button
            aria-label="Close modal"
            className="grid size-7 place-items-center rounded-[4px] border-1.5 border-ink bg-card text-ink shadow-[1.5px_1.5px_0_var(--ink)] transition-all hover:translate-x-px hover:translate-y-px hover:bg-destructive hover:text-white hover:shadow-none font-mono font-bold text-sm"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body: Full-Width Main Detail Area */}
        <div
          className={cn(
            "flex flex-1 flex-col min-h-0 min-w-0 bg-card select-text",
            nodeType === "code" || nodeType === "youtube" || nodeType === "browser"
              ? "overflow-hidden p-0"
              : "overflow-y-auto p-5 select-text",
          )}
        >
          <NodeDetailContent
            data={selectedNode.data}
            edges={edges}
            graphId={graphId}
            nodeId={selectedNode.id}
            nodes={nodes}
            nodeType={nodeType}
            onSelectNode={onSelectNode}
          />
        </div>

        {/* Modal Bottom Footer: [Node Meta][Continue in Agent] ----------- [Graph Relationships] */}
        <footer className="h-16 shrink-0 border-t-2 border-ink bg-muted/25 px-4 sm:px-5 flex items-center justify-between gap-4 font-mono text-xs">
          {/* Left: Node Meta + Continue in Agent CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 rounded border border-ink/30 bg-card px-2.5 py-1 text-[11px] shadow-[1px_1px_0_var(--ink)]">
              <span className="text-muted-foreground">ID:</span>
              <span className="truncate max-w-[120px] font-bold text-ink" title={selectedNode.id}>
                {selectedNode.id}
              </span>
              <button
                aria-label="Copy Node ID"
                className="hover:text-primary transition-colors text-muted-foreground shrink-0"
                onClick={copyNodeId}
                title="Copy Node ID"
                type="button"
              >
                {copiedId ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
              </button>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-muted-foreground">Pos:</span>
              <span className="font-bold text-ink">
                ({Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)})
              </span>
            </div>

            <Button
              className="h-7.5 border border-ink bg-ink text-card shadow-[1.5px_1.5px_0_var(--ink)] font-bold text-[11px] hover:translate-x-px hover:translate-y-px hover:shadow-none transition-all"
              onClick={continueFromNode}
              size="sm"
              type="button"
            >
              <Sparkles className="size-3.5 mr-1 text-signal-yellow" />
              <span>Continue in Agent</span>
            </Button>
          </div>

          {/* Right: Graph Relationships (Inbound & Outbound Horizontal Pills) */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 min-w-0">
            {inboundRelations.length === 0 && outboundRelations.length === 0 ? (
              <span className="text-[10.5px] text-muted-foreground italic">
                No connected graph relationships
              </span>
            ) : (
              <>
                {inboundRelations.map(({ edge, sourceNode }) => (
                  <button
                    key={`in-${edge.id}`}
                    className="flex items-center gap-1.5 rounded border border-ink/30 bg-card px-2 py-1 text-left font-mono text-[10px] hover:border-ink hover:bg-muted transition-all shrink-0 shadow-[1px_1px_0_var(--ink)]"
                    onClick={() => onSelectNode?.(sourceNode.id)}
                    title={`Upstream ${sourceNode.type}: ${getNodeTitle(sourceNode.data)}`}
                    type="button"
                  >
                    <ArrowDownRight className="size-3 text-primary shrink-0" />
                    <span className="truncate max-w-[120px] font-semibold text-ink">
                      {getNodeTitle(sourceNode.data)}
                    </span>
                    <span className="shrink-0 rounded bg-primary/10 px-1 py-0.2 text-[8px] font-bold uppercase text-primary border border-primary/20">
                      {edge.data?.relation?.replaceAll("_", " ") || "RELATES"}
                    </span>
                    <span className="text-[8px] text-muted-foreground">↳ IN</span>
                  </button>
                ))}

                {outboundRelations.map(({ edge, targetNode }) => (
                  <button
                    key={`out-${edge.id}`}
                    className="flex items-center gap-1.5 rounded border border-ink/30 bg-card px-2 py-1 text-left font-mono text-[10px] hover:border-ink hover:bg-muted transition-all shrink-0 shadow-[1px_1px_0_var(--ink)]"
                    onClick={() => onSelectNode?.(targetNode.id)}
                    title={`Downstream ${targetNode.type}: ${getNodeTitle(targetNode.data)}`}
                    type="button"
                  >
                    <ArrowUpRight className="size-3 text-success shrink-0" />
                    <span className="truncate max-w-[120px] font-semibold text-ink">
                      {getNodeTitle(targetNode.data)}
                    </span>
                    <span className="shrink-0 rounded bg-success/10 px-1 py-0.2 text-[8px] font-bold uppercase text-success border border-success/20">
                      {edge.data?.relation?.replaceAll("_", " ") || "LEADS TO"}
                    </span>
                    <span className="text-[8px] text-muted-foreground">OUT ⇁</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/** Component to render type-specific node detail representation */
function NodeDetailContent({
  data,
  nodeType: _nodeType,
  nodeId,
  graphId,
  nodes,
  edges,
  onSelectNode,
}: {
  data?: ExplorerNodeData;
  nodeType: string;
  nodeId?: string;
  graphId?: string;
  nodes?: ExplorerFlowNode[];
  edges?: ExplorerFlowEdge[];
  onSelectNode?: (nodeId: string) => void;
}) {
  if (!data) {
    return (
      <div className="grid place-items-center h-full text-muted-foreground font-mono text-xs">
        No data available for this node.
      </div>
    );
  }

  switch (data.kind) {
    case "browser": {
      return (
        <BrowserNodeDetailContent
          data={data}
          edges={edges}
          graphId={graphId}
          nodeId={nodeId}
          nodes={nodes}
          onSelectNode={onSelectNode}
        />
      );
    }

    case "youtube": {
      return <YoutubeNodeDetailContent data={data} graphId={graphId} nodeId={nodeId} />;
    }

    case "code": {
      return <CodeNodeDetailContent data={data} />;
    }

    case "finding": {
      return (
        <div className="flex flex-col flex-1 h-full space-y-5">
          <div className="rounded-[6px] border-2 border-ink bg-signal-green/15 p-4 shadow-[2px_2px_0_var(--ink)]">
            <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase">
              <span className="text-success">Investigation Finding</span>
              {data.confidence !== undefined ? (
                <span className="rounded bg-signal-green px-2 py-0.5 border border-ink font-bold text-ink">
                  {Math.round(data.confidence * 100)}% Confidence
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 font-heading text-sm font-bold text-ink leading-snug">
              {data.summary}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="rounded-[4px] border border-ink/30 bg-muted/30 p-3">
              <div className="text-[10px] font-bold uppercase text-tertiary">Status</div>
              <div className="mt-1 font-bold uppercase text-ink">{data.status || "open"}</div>
            </div>
            <div className="rounded-[4px] border border-ink/30 bg-muted/30 p-3">
              <div className="text-[10px] font-bold uppercase text-tertiary">Confidence Score</div>
              <div className="mt-1 font-bold text-ink">
                {data.confidence !== undefined ? `${Math.round(data.confidence * 100)}%` : "N/A"}
              </div>
            </div>
          </div>
        </div>
      );
    }

    case "issue": {
      return (
        <div className="flex flex-col flex-1 h-full space-y-4">
          <div className="rounded-[6px] border-2 border-ink bg-signal-pink/15 p-4 shadow-[2px_2px_0_var(--ink)]">
            <div className="font-mono text-[10px] font-bold uppercase text-danger">
              Issue Evidence
            </div>
            <h2 className="mt-1.5 font-mono text-xs font-bold text-ink">
              Issue ID: {data.issueId}
            </h2>
          </div>
          <div className="rounded-[4px] border border-ink/30 bg-muted/20 p-3.5 font-mono text-xs">
            <p className="text-muted-foreground text-[11px]">
              Connected to Traceability / Sentry issue record for exception diagnosis.
            </p>
          </div>
        </div>
      );
    }

    case "event": {
      return (
        <div className="flex flex-col flex-1 h-full space-y-4">
          <div className="rounded-[6px] border-2 border-ink bg-signal-cyan/15 p-4 shadow-[2px_2px_0_var(--ink)]">
            <div className="font-mono text-[10px] font-bold uppercase text-info">
              Production Event
            </div>
            <h2 className="mt-1.5 font-mono text-xs font-bold text-ink">
              Event ID: {data.eventId}
            </h2>
          </div>
          <div className="rounded-[4px] border border-ink/30 bg-muted/20 p-3.5 font-mono text-xs">
            <p className="text-muted-foreground text-[11px]">
              Specific runtime event snapshot captured with device and stack context.
            </p>
          </div>
        </div>
      );
    }

    case "replay": {
      return (
        <div className="flex flex-col flex-1 h-full space-y-4">
          <div className="rounded-[6px] border-2 border-ink bg-signal-purple/15 p-4 shadow-[2px_2px_0_var(--ink)]">
            <div className="font-mono text-[10px] font-bold uppercase text-primary">
              Session Replay
            </div>
            <h2 className="mt-1.5 font-mono text-xs font-bold text-ink">
              Replay ID: {data.replayId}
            </h2>
          </div>
          <div className="rounded-[4px] border border-ink/30 bg-muted/20 p-3.5 font-mono text-xs">
            <p className="text-muted-foreground text-[11px]">
              User session recording capturing DOM mutations, clicks, and console logs.
            </p>
          </div>
        </div>
      );
    }

    case "question": {
      return (
        <div className="flex flex-col flex-1 h-full space-y-4">
          <div className="rounded-[6px] border-2 border-ink bg-signal-yellow/20 p-4 shadow-[2px_2px_0_var(--ink)]">
            <div className="font-mono text-[10px] font-bold uppercase text-warning">
              Investigation Inquiry
            </div>
            <h2 className="mt-2 font-heading text-sm font-bold text-ink leading-snug">
              {data.prompt}
            </h2>
          </div>
          {data.intent ? (
            <div className="rounded-[4px] border border-ink/30 bg-muted/20 p-3.5">
              <div className="font-mono text-[10px] font-bold uppercase text-tertiary mb-1">
                Investigation Intent
              </div>
              <p className="text-xs text-ink font-sans leading-relaxed">{data.intent}</p>
            </div>
          ) : null}
        </div>
      );
    }

    case "document": {
      return (
        <div className="flex flex-col flex-1 h-full space-y-4">
          <div className="rounded-[6px] border-2 border-ink bg-signal-yellow/15 p-4 shadow-[2px_2px_0_var(--ink)]">
            <div className="font-mono text-[10px] font-bold uppercase text-tertiary">
              Reference Document
            </div>
            <h2 className="mt-1.5 font-heading text-sm font-bold text-ink">{data.title}</h2>
          </div>
          {data.excerpt ? (
            <div className="rounded-[4px] border border-ink/30 bg-muted/20 p-3.5">
              <div className="font-mono text-[10px] font-bold uppercase text-tertiary mb-1">
                Excerpt
              </div>
              <p className="text-xs text-ink leading-relaxed font-sans">{data.excerpt}</p>
            </div>
          ) : null}
        </div>
      );
    }

    default: {
      return (
        <div className="p-4 text-xs font-mono text-muted-foreground">
          {getNodeDescription(data)}
        </div>
      );
    }
  }
}

function getNodeAccentColor(type?: string) {
  switch (type) {
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
    case "youtube":
      return "var(--signal-red, #ef4444)";
    case "browser":
      return "var(--browser, #27ccf3)";
    default:
      return "var(--primary)";
  }
}
