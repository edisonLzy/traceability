import { Link2, Quote, X } from "lucide-react";
import React from "react";

import { useAnchoredFloating, type ScreenPoint } from "./annotation-floating";

export interface AnchorSelectionToolbarProps {
  anchor: ScreenPoint | null;
  boundary: HTMLElement | null;
  selectedText: string;
  onCreateAnchor: () => void;
  onCancel: () => void;
}

export function AnchorSelectionToolbar({
  anchor,
  boundary,
  selectedText: _selectedText,
  onCreateAnchor,
  onCancel,
}: AnchorSelectionToolbarProps) {
  const { floatingStyles, refs } = useAnchoredFloating(anchor, {
    boundary,
    offset: 8,
    onDismiss: onCancel,
    placement: "top",
  });

  if (!anchor) return null;

  return (
    <div
      ref={refs.setFloating}
      className="z-50 flex items-center gap-1.5 rounded-[6px] border-2 border-ink bg-ink p-1 font-mono text-card shadow-[3px_3px_0_var(--browser)] animate-in zoom-in-95"
      style={floatingStyles}
    >
      <button
        className="flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-bold hover:bg-white/15 transition-colors cursor-pointer"
        onClick={onCreateAnchor}
        type="button"
      >
        <Quote className="size-3 text-signal-yellow" />
        <span>证据片段</span>
      </button>
      <button
        className="flex items-center gap-1 rounded bg-signal-cyan px-2 py-1 text-[10.5px] font-bold text-ink hover:opacity-90 transition-opacity cursor-pointer"
        onClick={onCreateAnchor}
        type="button"
      >
        <Link2 className="size-3" />
        <span>创建 Anchor</span>
      </button>
      <button
        aria-label="Cancel"
        className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-white/20 hover:text-white cursor-pointer"
        onClick={onCancel}
        type="button"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
