import { trpc } from "@renderer/lib/trpc";
import { useCallback } from "react";
import { toast } from "sonner";

import type { ApplyGraphOperationsResult, GraphOperation } from "../../types";
import {
  applyOperationsToSnapshot,
  reconcileOperationResult,
  type ExplorerGraphState,
} from "./use-explorer-graph-state";

export interface ApplyGraphOperations {
  applyOperations: (
    operations: GraphOperation[],
    options?: { operationId?: string; actor?: "user" | "agent" },
  ) => Promise<ApplyGraphOperationsResult>;
}

interface UseApplyGraphOperationsOptions {
  projectId: string | undefined;
  graphId: string | undefined;
  state: ExplorerGraphState;
}

/**
 * Applies graph operations optimistically, retries once on version conflict,
 * and reconciles the server result back into the snapshot.
 */
export function useApplyGraphOperations({
  projectId,
  graphId,
  state,
}: UseApplyGraphOperationsOptions): ApplyGraphOperations {
  const applyMutation = trpc.graphs.applyOperations.useMutation();
  const { appliedOperationIdsRef, commitSnapshot, resync, snapshotRef } = state;

  const applyOperations = useCallback(
    async (
      operations: GraphOperation[],
      options?: { operationId?: string; actor?: "user" | "agent" },
    ) => {
      if (!projectId || !graphId) throw new Error("A project and graph are required.");
      const current = snapshotRef.current;
      if (!current) throw new Error("Graph snapshot is not ready.");

      const operationId = options?.operationId ?? crypto.randomUUID();
      const actor = options?.actor ?? "user";
      commitSnapshot(applyOperationsToSnapshot(current, operations));

      const send = async (baseVersion: number, attempt: number) => {
        try {
          return await applyMutation.mutateAsync({
            actor: { type: actor },
            baseVersion,
            graphId,
            operationId,
            operations,
            projectId,
          });
        } catch (cause) {
          const code = getTrpcErrorCode(cause);
          if (code === "CONFLICT" && attempt === 0) {
            const refreshed = await resync();
            if (refreshed) return send(refreshed.version, 1);
          }
          throw cause;
        }
      };

      try {
        const result = await send(current.version, 0);
        const reconciled = snapshotRef.current
          ? reconcileOperationResult(snapshotRef.current, operations, result)
          : snapshotRef.current;
        if (reconciled) {
          commitSnapshot({ ...reconciled, version: result.version });
        }
        appliedOperationIdsRef.current.add(operationId);
        return result;
      } catch (cause) {
        await resync();
        toast.error(cause instanceof Error ? cause.message : "Graph operation failed");
        throw cause;
      }
    },
    [
      appliedOperationIdsRef,
      applyMutation,
      commitSnapshot,
      graphId,
      projectId,
      resync,
      snapshotRef,
    ],
  );

  return { applyOperations };
}

function getTrpcErrorCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const error = cause as { data?: { code?: string }; shape?: { data?: { code?: string } } };
  return error.data?.code ?? error.shape?.data?.code;
}
