import { useDrag } from "@use-gesture/react";
import { useCallback, useEffect, useState, type CSSProperties, type DOMAttributes } from "react";

const LAUNCHER_PADDING = 18;
const LAUNCHER_SIZE = 48;
const DRAG_THRESHOLD = 4;

export interface LauncherPosition {
  x: number;
  y: number;
}

interface ElementSize {
  width: number;
  height: number;
}

interface LauncherBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

type LauncherButtonProps = DOMAttributes<HTMLButtonElement>;

interface UseDraggableAgentLauncherOptions {
  onPress: () => void;
}

function getLauncherBounds(
  boundary: ElementSize,
  launcher: ElementSize = { width: LAUNCHER_SIZE, height: LAUNCHER_SIZE },
  padding = LAUNCHER_PADDING,
): LauncherBounds {
  return {
    bottom: Math.max(padding, boundary.height - launcher.height - padding),
    left: padding,
    right: Math.max(padding, boundary.width - launcher.width - padding),
    top: padding,
  };
}

export function clampLauncherPosition(
  position: LauncherPosition,
  boundary: ElementSize,
  launcher: ElementSize = { width: LAUNCHER_SIZE, height: LAUNCHER_SIZE },
  padding = LAUNCHER_PADDING,
): LauncherPosition {
  const bounds = getLauncherBounds(boundary, launcher, padding);

  return {
    x: Math.min(bounds.right, Math.max(bounds.left, position.x)),
    y: Math.min(bounds.bottom, Math.max(bounds.top, position.y)),
  };
}

export function getSummarySide(
  position: LauncherPosition | null,
  boundaryWidth: number,
): "left" | "right" {
  if (position === null) return "left";
  return position.x + LAUNCHER_SIZE / 2 < boundaryWidth / 2 ? "right" : "left";
}

/** Owns launcher pointer gestures and keeps its current position inside a boundary element. */
export function useDraggableAgentLauncher({ onPress }: UseDraggableAgentLauncherOptions) {
  const [boundaryElement, setBoundaryElement] = useState<HTMLDivElement | null>(null);
  const [boundaryWidth, setBoundaryWidth] = useState(0);
  const [launcherElement, setLauncherElement] = useState<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState<LauncherPosition | null>(null);

  const clampPosition = useCallback(
    (candidate: LauncherPosition): LauncherPosition => {
      if (!boundaryElement) return candidate;
      const boundary = boundaryElement.getBoundingClientRect();
      const launcher = launcherElement?.getBoundingClientRect();

      return clampLauncherPosition(
        candidate,
        { width: boundary.width, height: boundary.height },
        {
          width: launcher?.width ?? LAUNCHER_SIZE,
          height: launcher?.height ?? LAUNCHER_SIZE,
        },
      );
    },
    [boundaryElement, launcherElement],
  );

  const getCurrentPosition = useCallback((): [number, number] => {
    if (position) return [position.x, position.y];
    if (!boundaryElement || !launcherElement) return [0, 0];

    const boundary = boundaryElement.getBoundingClientRect();
    const launcher = launcherElement.getBoundingClientRect();
    const initialPosition = clampPosition({
      x: launcher.left - boundary.left,
      y: launcher.top - boundary.top,
    });
    return [initialPosition.x, initialPosition.y];
  }, [boundaryElement, clampPosition, launcherElement, position]);

  const getDragBounds = useCallback(() => {
    const boundary = boundaryElement?.getBoundingClientRect();
    const launcher = launcherElement?.getBoundingClientRect();

    return getLauncherBounds(
      { height: boundary?.height ?? 0, width: boundary?.width ?? 0 },
      { height: launcher?.height ?? LAUNCHER_SIZE, width: launcher?.width ?? LAUNCHER_SIZE },
    );
  }, [boundaryElement, launcherElement]);

  const bindDrag = useDrag(
    ({ offset: [x, y], tap }) => {
      if (!tap) setPosition({ x, y });
    },
    {
      bounds: getDragBounds,
      filterTaps: true,
      from: getCurrentPosition,
      tapsThreshold: DRAG_THRESHOLD,
    },
  );

  useEffect(() => {
    if (!boundaryElement) return;

    const handleBoundaryResize = () => {
      setBoundaryWidth(boundaryElement.clientWidth);
      setPosition((current) => {
        if (current === null) return null;
        const next = clampPosition(current);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };

    handleBoundaryResize();
    const observer = new ResizeObserver(handleBoundaryResize);
    observer.observe(boundaryElement);
    return () => observer.disconnect();
  }, [boundaryElement, clampPosition]);

  const buttonProps: LauncherButtonProps = { ...bindDrag(), onClick: onPress };
  const style: CSSProperties | undefined = position
    ? { bottom: "auto", left: position.x, right: "auto", top: position.y }
    : undefined;

  return {
    boundaryElement,
    boundaryRef: setBoundaryElement,
    buttonProps,
    launcherElement,
    launcherRef: setLauncherElement,
    position,
    style,
    summarySide: getSummarySide(position, boundaryWidth),
  };
}
