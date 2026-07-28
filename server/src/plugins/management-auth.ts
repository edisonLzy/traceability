import { timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

import type { RuntimeConfig } from "../config/index.js";

export function createManagementAuth(config: RuntimeConfig) {
  return async function requireManagementAuth(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token || !safeEqual(token, config.managementAuthToken)) {
      return reply.code(401).send({ code: "unauthorized" });
    }
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
