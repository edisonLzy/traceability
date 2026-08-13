import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

import type { InboxCursor, InboxRepository } from "./repository.js";
import type { ListInboxInput, SaveInboxBriefInput } from "./types.js";

export class InboxService {
  public constructor(private readonly repository: InboxRepository) {}

  async listForProject(projectId: string, input: ListInboxInput) {
    const rows = await this.repository.listForProject(projectId, input, decodeCursor(input.cursor));
    const hasMore = rows.length > input.limit;
    const data = hasMore ? rows.slice(0, input.limit) : rows;
    const finalItem = data.at(-1);
    return {
      data,
      nextCursor:
        hasMore && finalItem ? encodeCursor(finalItem.lastActivityAt, finalItem.id) : null,
    };
  }

  getItem(inboxItemId: string) {
    return this.repository.findById(inboxItemId);
  }

  async resolve(inboxItemId: string, actorId: string) {
    return this.requireTransition(
      await this.repository.transitionByItemId(inboxItemId, "done", actorId),
    );
  }

  async dismiss(inboxItemId: string, actorId: string) {
    return this.requireTransition(
      await this.repository.transitionByItemId(inboxItemId, "dismissed", actorId),
    );
  }

  async reopen(inboxItemId: string, actorId: string) {
    return this.requireTransition(
      await this.repository.transitionByItemId(inboxItemId, "open", actorId),
    );
  }

  async saveBrief(inboxItemId: string, brief: SaveInboxBriefInput, actorId: string) {
    const item = await this.repository.saveBrief(inboxItemId, brief, actorId);
    if (!item) throw notFound();
    return item;
  }

  syncIssueState(issueId: string, state: "open" | "done" | "dismissed", actorId: string) {
    return this.repository.transitionByIssueId(issueId, state, actorId);
  }

  private requireTransition<T>(result: T | null): T {
    if (!result) throw notFound();
    return result;
  }
}

function notFound() {
  return new TRPCError({ code: "NOT_FOUND", message: "inbox item not found" });
}

function encodeCursor(lastActivityAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ lastActivityAt: lastActivityAt.toISOString(), id })).toString(
    "base64url",
  );
}

function decodeCursor(raw: string | undefined): InboxCursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    const value = parsed as { lastActivityAt?: unknown; id?: unknown };
    const lastActivityAt =
      typeof value.lastActivityAt === "string" ? new Date(value.lastActivityAt) : undefined;
    if (!lastActivityAt || Number.isNaN(lastActivityAt.valueOf()) || typeof value.id !== "string") {
      throw new Error("invalid");
    }
    return { lastActivityAt, id: value.id };
  } catch {
    throw new ZodError([{ code: "custom", path: ["cursor"], message: "cursor is invalid" }]);
  }
}
