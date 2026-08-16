import { useSharedPromptEditor } from "@extensions/core/renderer";
import { Button } from "@renderer/components/ui/button";
import { toast } from "sonner";

import type { ExplorerFlowNode } from "../../types";
import { getNodeDescription, getNodeTitle, nodeIcon } from "./ExplorerGraphNodeCard";

export function ExplorerGraphNodeDetail({
  graphId,
  onClose,
  selectedNode,
}: {
  graphId: string;
  onClose: () => void;
  selectedNode: ExplorerFlowNode;
}) {
  const sharedPromptEditor = useSharedPromptEditor();

  const continueFromNode = () => {
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
  };

  return (
    <aside className="absolute top-3 right-3 bottom-3 z-20 flex w-[300px] flex-col overflow-hidden rounded-[14px] border border-hairline-strong bg-surface-glass-elevated shadow-glass backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-hairline px-3.5 py-3">
        <span className="grid size-7 place-items-center rounded-[8px] border border-primary/20 bg-primary/10 text-primary-hover">
          {nodeIcon(selectedNode.type)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[12px] font-[680] text-ink">
            {getNodeTitle(selectedNode.data)}
          </h2>
          <p className="mt-0.5 text-[10px] text-tertiary">
            {selectedNode.type} node · {selectedNode.id}
          </p>
        </div>
        <Button
          aria-label="Close detail"
          onClick={onClose}
          size="icon-sm"
          title="Close detail"
          type="button"
          variant="ghost"
        >
          ×
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <div className="text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">
          Description
        </div>
        <div className="mt-2 rounded-[9px] border border-primary/35 bg-primary/[0.07] p-2.5 text-[11px] leading-5 text-primary-hover">
          {getNodeDescription(selectedNode.data)}
        </div>
        <div className="mt-4 text-[10px] font-[700] uppercase tracking-[0.08em] text-tertiary">
          Metadata
        </div>
        <dl className="mt-2 space-y-2 text-[10px]">
          <div className="flex justify-between gap-3">
            <dt className="text-tertiary">Graph node ID</dt>
            <dd className="truncate font-mono text-ink">{selectedNode.id}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tertiary">Position</dt>
            <dd className="font-mono text-ink">
              {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="border-t border-hairline p-3">
        <Button className="w-full" onClick={continueFromNode} type="button" variant="primary">
          Continue in Agent
        </Button>
      </div>
    </aside>
  );
}
