import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";

import type { RuntimeConfig } from "../config/index.js";
import type { Context } from "../trpc/context.js";

const AccessTokenPayloadSchema = z.object({
  userId: z.uuid(),
  username: z.string().min(1),
  email: z.email(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
}

export function createAccessToken(
  user: AuthenticatedUser,
  config: Pick<RuntimeConfig, "jwtSecret" | "jwtAccessTokenTtlSeconds">,
): string {
  return jwt.sign(
    { userId: user.id, username: user.username, email: user.email },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: config.jwtAccessTokenTtlSeconds } as SignOptions,
  );
}

export function verifyAccessToken(
  token: string,
  config: Pick<RuntimeConfig, "jwtSecret" | "jwtAccessTokenTtlSeconds">,
): AuthenticatedUser | null {
  try {
    const parsed = AccessTokenPayloadSchema.safeParse(jwt.verify(token, config.jwtSecret));
    return parsed.success
      ? { id: parsed.data.userId, username: parsed.data.username, email: parsed.data.email }
      : null;
  } catch {
    return null;
  }
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function getAuthenticatedUser(
  authorization: string | undefined,
  config: Pick<RuntimeConfig, "jwtSecret" | "jwtAccessTokenTtlSeconds">,
): AuthenticatedUser | null {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  return token ? verifyAccessToken(token, config) : null;
}

/** Route-level Fastify preHandler for endpoints outside the tRPC adapter. */
export async function requireFastifyAuthentication(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = getAuthenticatedUser(request.headers.authorization, request.server.config);
  if (!user) await reply.code(401).send({ code: "unauthorized" });
}

export function trpcAuthMiddleware() {
  return async ({ ctx, next }: { ctx: Context & { req: FastifyRequest }; next: any }) => {
    const user = getAuthenticatedUser(ctx.req.headers.authorization, ctx.config);
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "authentication required" });
    return next({ ctx: { user } });
  };
}

/**
 * Constant-time comparison of a Bearer Authorization header value against the
 * expected management token. Returns false for missing or malformed headers.
 */
export function verifyManagementBearerToken(
  authorization: string | undefined,
  expected: string,
): boolean {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) return false;
  const lb = Buffer.from(token);
  const rb = Buffer.from(expected);
  return lb.length === rb.length && timingSafeEqual(lb, rb);
}
