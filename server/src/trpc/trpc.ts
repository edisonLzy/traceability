import { initTRPC } from "@trpc/server";
import type { FastifyRequest } from "fastify";

import { trpcAuthMiddleware } from "../helper/auth.js";
import type { Context } from "./context.js";

/**
 * Extended context carried through procedure invocations. The request is
 * injected by the Fastify adapter's createContext so middleware can read
 * transport-level details (the Authorization header).
 */
export type RequestContext = Context & { req: FastifyRequest };

const t = initTRPC.context<RequestContext>().create();

/**
 * tRPC middleware that enforces the management Bearer token against the
 * server's configured `MANAGEMENT_AUTH_TOKEN`.
 */
const requireManagementAuth = t.middleware(trpcAuthMiddleware());

export { t };

/** A procedure that does not require authentication. */
export const publicProcedure = t.procedure;

/** A procedure that requires the management Bearer token. */
export const procedure = t.procedure.use(requireManagementAuth);
