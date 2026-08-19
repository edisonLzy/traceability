import { cn } from "@renderer/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { ExplorerFlowNode } from "../../types";
import {
  getNodeDescription,
  getNodeMeta,
  getNodeTitle,
  nodeIcon,
} from "./node-detail-views/_helpers";

/**
 * Explorer graph 节点卡片。视觉签名沿用 Agent Panel user-message 的新野兽派
 * 风格：2px ink 边框、`bg-card` 半透明背景、`hard-shadow-sm` 硬偏移阴影、
 * 左侧 monogram 头像（kind 信号色）。宽度改为 min/max 自适应，长标题不再
 * 被硬切。React Flow Handle 保留以便 React Flow 自身仍能管理连接。
 */
export function ExplorerGraphNodeCard({ data, type, selected }: NodeProps<ExplorerFlowNode>) {
  const title = getNodeTitle(data);
  const description = getNodeDescription(data);

  return (
    <div
      className={cn("explorer-node-v2", selected && "selected")}
      data-node-type={type}
      style={{ ["--node-accent" as string]: "var(--node-accent, var(--signal-yellow))" }}
    >
      <span className="explorer-node-v2__accent" />
      <Handle className="explorer-node-v2__handle" position={Position.Left} type="target" />
      <Handle className="explorer-node-v2__handle" position={Position.Right} type="source" />

      <div className="flex items-start gap-2 px-3 pt-3">
        <span
          className="grid size-8.5 shrink-0 place-items-center rounded-sm font-mono text-[10px] font-bold text-ink"
          style={{ backgroundColor: "var(--node-accent, var(--signal-yellow))" }}
        >
          {nodeIcon(type)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-[720] text-ink" title={title}>
            {title}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-tertiary">
            <span>{type}</span>
            <span className="opacity-60">·</span>
            <span className="truncate">{getNodeMeta(data)}</span>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <p className="line-clamp-3 text-[10px] leading-[1.55] text-ink-muted">{description}</p>
      </div>
    </div>
  );
}
