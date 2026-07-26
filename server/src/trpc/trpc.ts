import { timingSafeEqual } from "node:crypto";

import { initTRPC, TRPCError } from "@trpc/server";
import type { FastifyRequest } from "fastify";

import type { Context } from "./context.js";

/**
 * Extended context carried through procedure invocations. The request is
 * injected by the Fastify adapter's createContext so middleware can read
 * transport-level details (the Authorization header).
 */
export type RequestContext = Context & { req: FastifyRequest };

const t = initTRPC.context<RequestContext>().create();

export { t };

function safeEqual(left: string, right: string): boolean {
  const lb = Buffer.from(left);
  const rb = Buffer.from(right);
  return lb.length === rb.length && timingSafeEqual(lb, rb);
}

/**
 * tRPC middleware that enforces the management Bearer token against the
 * server's configured `MANAGEMENT_AUTH_TOKEN`. Must wrap every management
 * procedure.
 */
export const managementAuthMiddleware = t.middleware(async ({ ctx, next }) => {
  const authorization = ctx.req?.headers?.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token || !safeEqual(token, ctx.config.managementAuthToken)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "management authentication required" });
  }
  return next({ ctx });
});

/** A procedure that requires management Bearer auth. */
export const managementProcedure = t.procedure.use(managementAuthMiddleware);
