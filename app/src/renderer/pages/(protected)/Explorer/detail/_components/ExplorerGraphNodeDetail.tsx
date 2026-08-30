import { useSharedPromptEditor } from "@extensions/core/renderer";
import { Button } from "@renderer/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@renderer/components/ui/dialog";
import { ArrowDownRight, ArrowUpRight, Check, Copy, Sparkles, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ExplorerFlowEdge, ExplorerFlowNode, ExplorerNodeData } from "../../types";
import { getNodeDescription, getNodeTitle, nodeIcon } from "./ExplorerGraphNodeCard";

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

        {/* Modal Body: Left Detail Area + Right Inspector Sidebar */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Main Detail Area */}
          <div className="flex flex-1 flex-col min-w-0 border-r-2 border-ink bg-card overflow-y-auto p-5 select-text">
            <NodeDetailContent data={selectedNode.data} nodeType={nodeType} />
          </div>

          {/* Right Inspector Sidebar */}
          <aside className="flex w-[320px] shrink-0 flex-col justify-between overflow-y-auto bg-muted/20 p-4 font-mono text-xs space-y-4">
            <div className="space-y-4">
              {/* Node Metadata Card */}
              <div>
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-tertiary">
                  Node Metadata
                </div>
                <dl className="space-y-2 rounded-[4px] border border-ink/30 bg-card p-3 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Node ID</dt>
                    <dd className="flex items-center gap-1.5 truncate font-bold text-ink">
                      <span className="truncate max-w-[150px]" title={selectedNode.id}>
                        {selectedNode.id}
                      </span>
                      <button
                        aria-label="Copy Node ID"
                        className="hover:text-primary transition-colors shrink-0"
                        onClick={copyNodeId}
                        title="Copy Node ID"
                        type="button"
                      >
                        {copiedId ? (
                          <Check className="size-3 text-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-bold uppercase text-ink">{nodeType}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Position</dt>
                    <dd className="font-bold text-ink">
                      X: {Math.round(selectedNode.position.x)}, Y:{" "}
                      {Math.round(selectedNode.position.y)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Evidence Chain / Topology */}
              <div>
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-tertiary">
                  Graph Relationships
                </div>
                <div className="space-y-2.5 rounded-[4px] border border-ink/30 bg-card p-3">
                  {/* Inbound Relations */}
                  <div>
                    <div className="flex items-center gap-1 font-mono text-[9.5px] font-bold uppercase text-tertiary mb-1.5">
                      <ArrowDownRight className="size-3 text-primary" />
                      <span>Inbound (Upstream):</span>
                    </div>
                    {inboundRelations.length > 0 ? (
                      <div className="space-y-1.5">
                        {inboundRelations.map(({ edge, sourceNode }) => (
                          <button
                            key={edge.id}
                            className="flex w-full items-center justify-between gap-2 rounded-[3px] border border-ink/20 bg-muted/40 p-1.5 text-left font-mono text-[10px] hover:border-ink hover:bg-muted transition-all"
                            onClick={() => onSelectNode?.(sourceNode.id)}
                            title={`Jump to ${sourceNode.type}: ${getNodeTitle(sourceNode.data)}`}
                            type="button"
                          >
                            <span className="truncate font-semibold text-ink">
                              {getNodeTitle(sourceNode.data)}
                            </span>
                            <span className="shrink-0 rounded bg-card px-1 py-0.5 text-[8.5px] font-bold uppercase text-primary border border-ink/20">
                              {edge.data?.relation?.replaceAll("_", " ") || "RELATES"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="font-mono text-[10px] text-tertiary italic">
                        No upstream incoming edges (Root evidence)
                      </p>
                    )}
                  </div>

                  {/* Outbound Relations */}
                  <div className="pt-2 border-t border-ink/15">
                    <div className="flex items-center gap-1 font-mono text-[9.5px] font-bold uppercase text-tertiary mb-1.5">
                      <ArrowUpRight className="size-3 text-success" />
                      <span>Outbound (Downstream):</span>
                    </div>
                    {outboundRelations.length > 0 ? (
                      <div className="space-y-1.5">
                        {outboundRelations.map(({ edge, targetNode }) => (
                          <button
                            key={edge.id}
                            className="flex w-full items-center justify-between gap-2 rounded-[3px] border border-ink/20 bg-muted/40 p-1.5 text-left font-mono text-[10px] hover:border-ink hover:bg-muted transition-all"
                            onClick={() => onSelectNode?.(targetNode.id)}
                            title={`Jump to ${targetNode.type}: ${getNodeTitle(targetNode.data)}`}
                            type="button"
                          >
                            <span className="truncate font-semibold text-ink">
                              {getNodeTitle(targetNode.data)}
                            </span>
                            <span className="shrink-0 rounded bg-card px-1 py-0.5 text-[8.5px] font-bold uppercase text-success border border-ink/20">
                              {edge.data?.relation?.replaceAll("_", " ") || "LEADS TO"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="font-mono text-[10px] text-tertiary italic">
                        No downstream outgoing edges (Leaf evidence)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Action */}
            <div className="pt-2 border-t border-ink/20">
              <Button
                className="w-full border-2 border-ink shadow-[2px_2px_0_var(--ink)] font-bold text-[11px] hover:translate-x-px hover:translate-y-px hover:shadow-none transition-all"
                onClick={continueFromNode}
                type="button"
                variant="default"
              >
                <Sparkles className="size-3.5" />
                <span>Continue in Agent</span>
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Component to render type-specific node detail representation */
function NodeDetailContent({ data, nodeType }: { data?: ExplorerNodeData; nodeType: string }) {
  if (!data) {
    return (
      <div className="grid place-items-center h-full text-muted-foreground font-mono text-xs">
        No data available for this node.
      </div>
    );
  }

  switch (data.kind) {
    case "code": {
      return (
        <div className="flex flex-col flex-1 h-full min-h-0 space-y-4">
          <div className="flex items-center justify-between border-b border-ink/15 pb-3 shrink-0">
            <div className="space-y-1">
              <div className="font-mono text-[10px] font-bold uppercase text-tertiary">
                Code Reference
              </div>
              <div className="font-mono text-xs font-bold text-ink">{data.path || "Untitled"}</div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px]">
              {data.language ? (
                <span className="rounded bg-muted px-2 py-0.5 border border-ink/20 font-bold uppercase text-ink">
                  {data.language}
                </span>
              ) : null}
              {data.startLine ? (
                <span className="rounded bg-primary/15 px-2 py-0.5 border border-ink/20 font-bold text-primary">
                  L{data.startLine}
                  {data.endLine ? `-L${data.endLine}` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] font-bold uppercase text-tertiary shrink-0">
              <span>Code Snippet</span>
              <button
                className="hover:text-primary transition-colors flex items-center gap-1"
                onClick={() => {
                  if (data.snippet) {
                    void navigator.clipboard.writeText(data.snippet);
                    toast.success("Code snippet copied");
                  }
                }}
                type="button"
              >
                <Copy className="size-3" />
                <span>Copy</span>
              </button>
            </div>
            <pre className="flex-1 min-h-0 overflow-auto rounded-[6px] border-2 border-ink bg-code-bg p-4 font-mono text-[11.5px] leading-relaxed text-code-text shadow-[2px_2px_0_var(--ink)]">
              <code>{data.snippet || "// No code snippet text available."}</code>
            </pre>
          </div>
        </div>
      );
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
    default:
      return "var(--primary)";
  }
}
