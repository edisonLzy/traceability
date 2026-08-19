import { X } from "lucide-react";
import { useEffect } from "react";

import type { ExplorerFlowNode } from "../../types";
import { NODE_DETAIL_VIEWS } from "./node-detail-views";
import { getNodeTitle, nodeIcon } from "./node-detail-views/_helpers";

interface ExplorerNodeDetailPanelProps {
  graphId: string;
  selectedNode: ExplorerFlowNode;
  onClose: () => void;
}

/**
 * 节点详情内联模态层。直接渲染在 Explorer 容器内（不再走 base-ui Portal），
 * 背景遮罩和弹窗都使用 `absolute` 定位相对 Explorer 容器，不会覆盖 AgentPanel
 * 与 Sidebar。视觉签名沿用原来的野兽派风格：2px ink 边框、`bg-card` 背景、
 * `hard-shadow` 硬偏移阴影、kind 信号色 monogram。
 */
export function ExplorerNodeDetailPanel({
  graphId,
  selectedNode,
  onClose,
}: ExplorerNodeDetailPanelProps) {
  const View = NODE_DETAIL_VIEWS[selectedNode.type];

  // Escape 关闭面板。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const title = getNodeTitle(selectedNode.data);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center"
      data-node-type={selectedNode.type}
    >
      <button
        aria-label="Close detail"
        className="absolute inset-0 cursor-default bg-canvas/95 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="explorer-node-detail-title"
        aria-modal="true"
        className="relative flex max-h-[80vh] w-full max-w-[680px] flex-col overflow-hidden rounded-md border-2 border-ink bg-card shadow-[var(--hard-shadow)]"
        role="dialog"
      >
        <header className="flex shrink-0 items-center gap-3 border-b-2 border-ink px-4 py-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-sm font-mono text-[12px] font-bold text-ink"
            style={{ backgroundColor: "var(--node-accent, var(--signal-yellow))" }}
          >
            {nodeIcon(selectedNode.type)}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-[14px] font-[720] text-ink"
              id="explorer-node-detail-title"
              title={title}
            >
              {title}
            </h2>
            <p className="text-[10px] uppercase tracking-[0.08em] text-tertiary">
              {selectedNode.type} node · {selectedNode.id}
            </p>
          </div>
          <button
            aria-label="Close detail"
            className="grid size-8 shrink-0 place-items-center rounded-sm border border-hairline bg-overlay text-ink transition hover:bg-overlay-strong"
            onClick={onClose}
            title="Close detail"
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <View graphId={graphId} node={selectedNode} onClose={onClose} />
        </div>

        <footer className="flex shrink-0 justify-between border-t-2 border-ink bg-surface-2 px-4 py-2.5">
          <span className="font-mono text-[10px] text-tertiary">
            pos {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
          </span>
          <span className="font-mono text-[10px] text-tertiary">node id {selectedNode.id}</span>
        </footer>
      </div>
    </div>
  );
}
