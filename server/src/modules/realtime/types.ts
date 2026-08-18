export const REALTIME_CHANNEL = "graph.events";

/** Messages a renderer sends over an authenticated WebSocket connection. */
export type RealtimeClientMessage =
  | { type: "subscribe"; projectId: string; graphId: string }
  | { type: "unsubscribe"; graphId: string }
  | { type: "pong" };
