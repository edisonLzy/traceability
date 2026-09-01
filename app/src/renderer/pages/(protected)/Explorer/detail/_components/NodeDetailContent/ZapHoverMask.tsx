import { MousePointer2 } from "lucide-react";
import React from "react";

export interface ZapHoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ZapHoverMaskProps {
  rect: ZapHoverRect | null;
  label?: string;
}

export function ZapHoverMask({ rect, label }: ZapHoverMaskProps) {
  if (!rect || rect.width === 0 || rect.height === 0) return null;

  return (
    <div
      className="pointer-events-none absolute z-30 rounded-[4px] border-2 border-dashed border-danger bg-signal-pink/15 transition-all duration-75"
      style={{
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    >
      <div className="absolute -top-6 left-0 flex items-center gap-1 rounded-[3px] bg-danger px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white shadow-sm whitespace-nowrap animate-in fade-in">
        <MousePointer2 className="size-2.5" />
        <span>{label || "点击隐藏此区域 (Esc 退出)"}</span>
      </div>
    </div>
  );
}
