import { randomUUID } from "node:crypto";

import type IORedis from "ioredis";
import jwt, { type SignOptions } from "jsonwebtoken";

import type { RuntimeConfig } from "../../config/index.js";

/**
 * Issues short-lived, single-use WebSocket tickets. A renderer cannot set an
 * Authorization header on a browser WebSocket, so it exchanges its access JWT
 * for a ticket via `realtime.createTicket` and passes the ticket as a query
 * param. Each ticket is bound to a user and consumed exactly once.
 */
export class RealtimeTicketService {
  public constructor(
    private readonly config: Pick<RuntimeConfig, "jwtSecret" | "realtimeTicketTtlSeconds">,
    private readonly redis: IORedis,
  ) {}

  async createTicket(userId: string): Promise<{ ticket: string; expiresIn: number }> {
    const jti = randomUUID();
    const ttl = this.config.realtimeTicketTtlSeconds;
    const ticket = jwt.sign({ userId, jti }, this.config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: ttl,
    } as SignOptions);
    await this.redis.set(`realtime:ticket:${jti}`, userId, "EX", ttl, "NX");
    return { ticket, expiresIn: ttl };
  }

  /** Returns the bound userId, or null when the ticket is invalid, expired, or already used. */
  async consumeTicket(ticket: string): Promise<string | null> {
    let payload: unknown;
    try {
      payload = jwt.verify(ticket, this.config.jwtSecret);
    } catch {
      return null;
    }
    if (!payload || typeof payload !== "object") return null;
    const { userId, jti } = payload as { userId?: unknown; jti?: unknown };
    if (typeof userId !== "string" || typeof jti !== "string") return null;

    const stored = await this.redis.getdel(`realtime:ticket:${jti}`);
    return stored === userId ? userId : null;
  }
}
