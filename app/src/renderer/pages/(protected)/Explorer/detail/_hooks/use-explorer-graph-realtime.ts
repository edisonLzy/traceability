import { resolveRendererServerUrl, trpc } from "@renderer/lib/trpc";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ExplorerRealtimeStatus, GraphCommittedEvent } from "../../types";
import { applyOperationsToSnapshot, type ExplorerGraphState } from "./use-explorer-graph-state";

export interface ExplorerRealtimeState {
  status: ExplorerRealtimeStatus;
  lastError: string | null;
}

interface UseExplorerGraphRealtimeOptions {
  projectId: string;
  graphId: string;
  state: ExplorerGraphState;
  enabled?: boolean;
}

/**
 * Subscribes to graph commit events and folds them into the local snapshot,
 * skipping this client's own echoes and resyncing across create/branch gaps.
 */
export function useExplorerGraphRealtime({
  projectId,
  graphId,
  state,
  enabled = true,
}: UseExplorerGraphRealtimeOptions): ExplorerRealtimeState {
  const { appliedOperationIdsRef, commitSnapshot, resync, snapshotRef } = state;

  const handleCommittedEvent = useCallback(
    (event: GraphCommittedEvent) => {
      const current = snapshotRef.current;
      if (!current || event.graphId !== graphId) return;

      if (appliedOperationIdsRef.current.has(event.operationId)) {
        if (event.graphVersion > current.version) {
          commitSnapshot({ ...current, version: event.graphVersion });
        }
        appliedOperationIdsRef.current.delete(event.operationId);
        return;
      }
      if (event.graphVersion <= current.version) return;

      // Create operations carry client temporary IDs while the server emits
      // persisted IDs in the snapshot. Pull a snapshot instead of guessing a
      // mapping for another client's create event.
      if (
        event.operations.some(
          (operation) => operation.op === "createNode" || operation.op === "createEdge",
        )
      ) {
        void resync();
        return;
      }

      if (event.graphVersion > current.version + 1) {
        void resync();
        return;
      }

      commitSnapshot({
        ...applyOperationsToSnapshot(current, event.operations),
        version: event.graphVersion,
      });
    },
    [appliedOperationIdsRef, commitSnapshot, graphId, resync, snapshotRef],
  );

  return useExplorerRealtime({ enabled, graphId, onEvent: handleCommittedEvent, projectId });
}

// WebSocket subscription moved from lib/realtime.ts. `disconnect` is internal
// to the effect cleanup and is not exposed — callers only read status/error.

function useExplorerRealtime({
  projectId,
  graphId,
  enabled = true,
  onEvent,
}: {
  projectId: string;
  graphId: string;
  enabled?: boolean;
  onEvent: (event: GraphCommittedEvent) => void;
}): ExplorerRealtimeState {
  const createTicket = trpc.realtime.createTicket.useMutation();
  const [status, setStatus] = useState<ExplorerRealtimeStatus>(enabled ? "connecting" : "idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const disconnect = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    socketRef.current?.close(1000, "component disposed");
    socketRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled || !projectId || !graphId) {
      disconnect();
      setStatus("idle");
      return;
    }

    let disposed = false;
    const connect = async () => {
      if (disposed) return;
      setStatus(retryAttemptRef.current > 0 ? "reconnecting" : "connecting");
      try {
        const { ticket } = await createTicket.mutateAsync();
        if (disposed) return;

        const serverUrl = new URL(resolveRendererServerUrl());
        serverUrl.protocol = serverUrl.protocol === "https:" ? "wss:" : "ws:";
        serverUrl.pathname = "/api/realtime";
        serverUrl.search = new URLSearchParams({ ticket }).toString();

        const socket = new WebSocket(serverUrl.toString());
        socketRef.current = socket;

        socket.addEventListener("open", () => {
          retryAttemptRef.current = 0;
          setLastError(null);
          socket.send(JSON.stringify({ type: "subscribe", projectId, graphId }));
        });
        socket.addEventListener("message", (message) => {
          try {
            const payload = JSON.parse(String(message.data)) as Record<string, unknown>;
            if (payload.type === "ping") {
              socket.send(JSON.stringify({ type: "pong" }));
              return;
            }
            if (payload.type === "subscribed") {
              setStatus("connected");
              return;
            }
            if (payload.type === "error") {
              setLastError(
                typeof payload.message === "string" ? payload.message : "Realtime error",
              );
              setStatus("error");
              return;
            }
            if (
              payload.type === "graph.operation.committed" &&
              payload.graphId === graphId &&
              typeof payload.graphVersion === "number" &&
              typeof payload.operationId === "string" &&
              Array.isArray(payload.operations)
            ) {
              onEventRef.current(payload as unknown as GraphCommittedEvent);
            }
          } catch {
            setLastError("Received an invalid realtime message.");
          }
        });
        socket.addEventListener("close", (event) => {
          if (disposed) return;
          socketRef.current = null;
          if (event.code === 1000) return;
          retryAttemptRef.current += 1;
          setStatus("reconnecting");
          const delay = Math.min(10_000, 500 * 2 ** Math.min(retryAttemptRef.current, 4));
          retryTimerRef.current = window.setTimeout(() => void connect(), delay);
        });
        socket.addEventListener("error", () => {
          if (!disposed) {
            setLastError("Realtime connection failed.");
            setStatus("reconnecting");
          }
        });
      } catch (cause) {
        if (disposed) return;
        retryAttemptRef.current += 1;
        setLastError(cause instanceof Error ? cause.message : String(cause));
        setStatus("reconnecting");
        const delay = Math.min(10_000, 500 * 2 ** Math.min(retryAttemptRef.current, 4));
        retryTimerRef.current = window.setTimeout(() => void connect(), delay);
      }
    };

    void connect();
    return () => {
      disposed = true;
      disconnect();
    };
  }, [createTicket.mutateAsync, disconnect, enabled, graphId, projectId]);

  return { status, lastError };
}
