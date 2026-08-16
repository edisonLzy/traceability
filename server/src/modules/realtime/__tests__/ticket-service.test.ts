import { randomUUID } from "node:crypto";

import type IORedis from "ioredis";
import jwt, { type SignOptions } from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RealtimeTicketService } from "../ticket-service.js";

const JWT_SECRET = "a secure secret that contains at least thirty-two characters";
const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeRedis() {
  return {
    set: vi.fn(async () => "OK"),
    getdel: vi.fn(async () => null),
  } as unknown as IORedis;
}

describe("RealtimeTicketService", () => {
  let redis: IORedis;
  let service: RealtimeTicketService;

  beforeEach(() => {
    redis = makeRedis();
    service = new RealtimeTicketService(
      { jwtSecret: JWT_SECRET, realtimeTicketTtlSeconds: 60 },
      redis,
    );
  });

  it("issues a short-lived ticket and stores a single-use marker", async () => {
    const { ticket, expiresIn } = await service.createTicket(USER_ID);

    expect(expiresIn).toBe(60);
    expect(ticket).toBeTypeOf("string");
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^realtime:ticket:/),
      USER_ID,
      "EX",
      60,
      "NX",
    );
  });

  it("consumes a ticket exactly once", async () => {
    vi.mocked(redis.getdel).mockResolvedValue(USER_ID);
    const { ticket } = await service.createTicket(USER_ID);

    await expect(service.consumeTicket(ticket)).resolves.toBe(USER_ID);

    vi.mocked(redis.getdel).mockResolvedValue(null);
    await expect(service.consumeTicket(ticket)).resolves.toBeNull();
  });

  it("rejects a malformed ticket", async () => {
    await expect(service.consumeTicket("not-a-jwt")).resolves.toBeNull();
    expect(redis.getdel).not.toHaveBeenCalled();
  });

  it("rejects an expired ticket", async () => {
    const expired = jwt.sign({ userId: USER_ID, jti: randomUUID() }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: -1,
    } as SignOptions);

    await expect(service.consumeTicket(expired)).resolves.toBeNull();
    expect(redis.getdel).not.toHaveBeenCalled();
  });

  it("rejects a ticket bound to a different user", async () => {
    const ticket = jwt.sign({ userId: USER_ID, jti: randomUUID() }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: 60,
    } as SignOptions);
    vi.mocked(redis.getdel).mockResolvedValue("another-user-id");

    await expect(service.consumeTicket(ticket)).resolves.toBeNull();
  });
});
