import { cn } from "@renderer/lib/utils";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import type { ExplorerFlowEdge } from "../../types";

export function ExplorerGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  label,
  selected,
}: EdgeProps<ExplorerFlowEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const relation = data?.relation;
  const isCausal =
    relation === "caused_by" ||
    relation === "investigates" ||
    relation === "observed_in" ||
    relation === "supports";

  return (
    <>
      <BaseEdge
        className={cn(
          "explorer-edge__path",
          isCausal && "explorer-edge__path--causal",
          selected && "explorer-edge__path--selected",
        )}
        id={id}
        markerEnd={markerEnd}
        path={edgePath}
        style={style}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "explorer-edge__label nodrag nopan",
              selected && "explorer-edge__label--selected",
            )}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
