import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";
import WebSocket from "ws";

import { createRedisClient } from "../../infrastructure/redis/client.js";
import type { GraphCommittedEvent } from "../graphs/types.js";
import { subscribeEvents } from "./event-bus.js";
import { REALTIME_CHANNEL } from "./types.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * WebSocket gateway. It only distributes already-committed events — all
 * mutations still go through tRPC. It subscribes to the shared Redis channel
 * (so any API instance receives events regardless of which instance handled
 * the mutation) and fans them out to the per-graph rooms it maintains locally.
 */
const registerRealtimeGateway: FastifyPluginAsync = async (app) => {
  const rooms = new Map<string, Set<WebSocket>>();
  const subscriber = createRedisClient(app.config.redisUrl);
  subscriber.on("error", (err) => app.log.warn({ err }, "realtime subscriber error"));

  subscribeEvents(subscriber, REALTIME_CHANNEL, (message) => {
    let event: GraphCommittedEvent;
    try {
      event = JSON.parse(message) as GraphCommittedEvent;
    } catch {
      return;
    }
    const sockets = rooms.get(event.graphId);
    if (!sockets) return;
    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
  });

  app.get("/api/realtime", { websocket: true }, async (connection, request) => {
    const socket = connection;
    const ticket = (request.query as { ticket?: string }).ticket;
    const userId = await app.container.realtime.consumeTicket(ticket ?? "");
    if (!userId) {
      socket.close(1008, "invalid ticket");
      return;
    }

    const subscribed = new Set<string>();

    socket.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const message = parsed as { type?: unknown; graphId?: unknown; projectId?: unknown };

      if (
        message.type === "subscribe" &&
        typeof message.graphId === "string" &&
        typeof message.projectId === "string"
      ) {
        void app.container.graphs
          .getGraph(message.projectId, message.graphId)
          .then((graph) => {
            if (!graph) {
              socket.send(
                JSON.stringify({
                  type: "error",
                  code: "not_found",
                  message: "graph not found or not in project",
                }),
              );
              return;
            }
            let room = rooms.get(message.graphId as string);
            if (!room) {
              room = new Set();
              rooms.set(message.graphId as string, room);
            }
            room.add(socket);
            subscribed.add(message.graphId as string);
            socket.send(JSON.stringify({ type: "subscribed", graphId: message.graphId }));
          })
          .catch(() => {
            socket.send(
              JSON.stringify({
                type: "error",
                code: "subscribe_failed",
                message: "failed to subscribe",
              }),
            );
          });
      } else if (message.type === "unsubscribe" && typeof message.graphId === "string") {
        const room = rooms.get(message.graphId);
        if (room) room.delete(socket);
        subscribed.delete(message.graphId);
      }
      // "pong" is intentionally ignored; keep-alive is handled at the ws protocol level.
    });

    socket.on("close", () => {
      for (const graphId of subscribed) {
        const room = rooms.get(graphId);
        if (!room) continue;
        room.delete(socket);
        if (room.size === 0) rooms.delete(graphId);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const [graphId, sockets] of rooms) {
      for (const socket of sockets) {
        if (socket.readyState !== WebSocket.OPEN) sockets.delete(socket);
        else socket.ping();
      }
      if (sockets.size === 0) rooms.delete(graphId);
    }
  }, HEARTBEAT_INTERVAL_MS);

  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    subscriber.disconnect();
  });
};

export const realtimeGateway = fastifyPlugin(registerRealtimeGateway, {
  name: "realtime-gateway",
  dependencies: ["config", "redis", "container"],
});
