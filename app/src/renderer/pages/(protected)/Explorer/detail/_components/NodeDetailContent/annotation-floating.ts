import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  type Placement,
} from "@floating-ui/react-dom";
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect } from "react";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface UseAnchoredFloatingReturn {
  floatingStyles: CSSProperties;
  refs: {
    setFloating: (node: HTMLElement | null) => void;
  };
}

export function useAnchoredFloating(
  anchor: ScreenPoint | null,
  options: {
    boundary?: HTMLElement | null;
    offset?: number;
    onDismiss?(): void;
    placement?: Placement;
  } = {},
): UseAnchoredFloatingReturn {
  const { boundary = null, offset: offsetPx = 8, onDismiss, placement = "top" } = options;
  const { floatingStyles, refs, update } = useFloating({
    middleware: [
      offset(offsetPx),
      flip({ boundary: boundary ?? undefined, padding: 8 }),
      shift({ boundary: boundary ?? undefined, padding: 8 }),
      size({
        apply({
          availableHeight,
          availableWidth,
          elements,
        }: {
          availableHeight: number;
          availableWidth: number;
          elements: { floating: HTMLElement };
        }) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
          elements.floating.style.maxWidth = `${Math.max(0, availableWidth)}px`;
        },
        boundary: boundary ?? undefined,
        padding: 8,
      }),
    ],
    placement,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    refs.setReference(anchor ? virtualElementAt(anchor, boundary) : null);
    void update();
  }, [anchor, boundary, refs, update]);

  useEffect(() => {
    if (!anchor || !onDismiss) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [anchor, onDismiss]);

  const style: CSSProperties = {
    ...floatingStyles,
    visibility: anchor && floatingStyles.left !== undefined ? "visible" : "hidden",
  };

  return {
    floatingStyles: style,
    refs: { setFloating: refs.setFloating },
  };
}

function virtualElementAt(point: ScreenPoint, boundary: HTMLElement | null) {
  return {
    contextElement: boundary ?? document.documentElement,
    getBoundingClientRect() {
      const { x, y } = point;
      return { bottom: y, height: 0, left: x, right: x, top: y, width: 0, x, y };
    },
  };
}
