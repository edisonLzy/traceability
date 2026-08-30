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
    <aside className="absolute top-3 right-3 bottom-3 z-20 flex w-[320px] flex-col overflow-hidden rounded-[6px] border-2 border-ink bg-card shadow-[4px_4px_0_var(--ink)]">
      <div className="flex items-center gap-2.5 border-b-2 border-ink bg-muted/30 px-3.5 py-3">
        <span className="grid size-7 place-items-center rounded-[4px] border-1.5 border-ink bg-primary/20 text-[13px] font-bold font-mono text-primary-hover">
          {nodeIcon(selectedNode.type)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-[12px] font-bold text-ink">
            {getNodeTitle(selectedNode.data)}
          </h2>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {selectedNode.type} · {selectedNode.id.slice(0, 8)}
          </p>
        </div>
        <button
          aria-label="Close detail"
          className="grid size-6 place-items-center rounded-[3px] border border-ink bg-card text-ink shadow-[1px_1px_0_var(--ink)] transition-all hover:translate-x-px hover:translate-y-px hover:bg-destructive hover:text-white hover:shadow-none"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5 space-y-4">
        <div>
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-tertiary">
            Description
          </div>
          <div className="mt-1.5 rounded-[4px] border border-ink/40 bg-muted/30 p-2.5 font-sans text-[11px] leading-5 font-medium text-ink">
            {getNodeDescription(selectedNode.data)}
          </div>
        </div>

        <div>
          <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-tertiary">
            Node Position & IDs
          </div>
          <dl className="mt-1.5 rounded-[4px] border border-ink/30 bg-muted/20 p-2.5 font-mono text-[10px] space-y-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Node ID</dt>
              <dd className="truncate font-bold text-ink" title={selectedNode.id}>
                {selectedNode.id}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="font-bold text-ink uppercase">{selectedNode.type}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Position (X, Y)</dt>
              <dd className="font-bold text-ink">
                X: {Math.round(selectedNode.position.x)}, Y: {Math.round(selectedNode.position.y)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="border-t-2 border-ink bg-muted/20 p-3">
        <Button
          className="w-full border-2 border-ink shadow-[2px_2px_0_var(--ink)] font-bold text-[11px] hover:translate-x-px hover:translate-y-px hover:shadow-none transition-all"
          onClick={continueFromNode}
          type="button"
          variant="default"
        >
          Continue in Agent
        </Button>
      </div>
    </aside>
  );
}
