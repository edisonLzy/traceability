import { describe, expect, it, vi } from "vitest";

import type { InboxRepository } from "./repository.js";
import { InboxService } from "./service.js";

function makeRepository() {
  return {
    listForProject: vi.fn(),
    findById: vi.fn(),
    transitionByItemId: vi.fn(),
    transitionByIssueId: vi.fn(),
    saveBrief: vi.fn(),
  } as unknown as InboxRepository;
}

describe("InboxService", () => {
  it("paginates items by last activity and decodes the next cursor", async () => {
    const repository = makeRepository();
    const listForProject = vi.mocked(repository.listForProject);
    const rows = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        lastActivityAt: new Date("2026-08-12T10:00:00.000Z"),
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        lastActivityAt: new Date("2026-08-12T09:00:00.000Z"),
      },
    ];
    listForProject.mockResolvedValue(rows as never);
    const service = new InboxService(repository);

    const firstPage = await service.listForProject("project-1", {
      view: "active",
      limit: 1,
    });
    expect(firstPage.data).toEqual([rows[0]]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    listForProject.mockResolvedValue([]);
    await service.listForProject("project-1", {
      view: "active",
      cursor: firstPage.nextCursor!,
      limit: 1,
    });
    expect(listForProject).toHaveBeenLastCalledWith(
      "project-1",
      expect.objectContaining({ cursor: firstPage.nextCursor }),
      {
        id: rows[0]!.id,
        lastActivityAt: rows[0]!.lastActivityAt,
      },
    );
  });

  it("rejects malformed cursors", async () => {
    const service = new InboxService(makeRepository());

    await expect(
      service.listForProject("project-1", {
        view: "active",
        cursor: "not-a-cursor",
        limit: 20,
      }),
    ).rejects.toMatchObject({ issues: [{ path: ["cursor"], message: "cursor is invalid" }] });
  });

  it("maps resolve, dismiss, and reopen to their durable states", async () => {
    const repository = makeRepository();
    const transition = vi.mocked(repository.transitionByItemId);
    transition.mockImplementation(async (_id, state) => ({ item: { state }, issue: {} }) as never);
    const service = new InboxService(repository);

    await service.resolve("item-1", "user-1");
    await service.dismiss("item-1", "user-1");
    await service.reopen("item-1", "user-1");

    expect(transition.mock.calls).toEqual([
      ["item-1", "done", "user-1"],
      ["item-1", "dismissed", "user-1"],
      ["item-1", "open", "user-1"],
    ]);
  });

  it("returns NOT_FOUND when a state transition targets a missing item", async () => {
    const repository = makeRepository();
    vi.mocked(repository.transitionByItemId).mockResolvedValue(null);
    const service = new InboxService(repository);

    await expect(service.resolve("missing", "user-1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("persists the fixed structured Agent brief", async () => {
    const repository = makeRepository();
    const saveBrief = vi.mocked(repository.saveBrief);
    saveBrief.mockResolvedValue({ id: "item-1" } as never);
    const service = new InboxService(repository);
    const brief = {
      summary: "Checkout throws for expired sessions.",
      hypothesis: "The refresh token race leaves stale auth state.",
      nextAction: "Serialize refresh requests and add a regression test.",
    };

    await expect(service.saveBrief("item-1", brief, "user-1")).resolves.toEqual({ id: "item-1" });
    expect(saveBrief).toHaveBeenCalledWith("item-1", brief, "user-1");
  });
});
