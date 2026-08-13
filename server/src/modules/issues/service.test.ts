import { describe, expect, it, vi } from "vitest";

import type { InboxService } from "../inbox/service.js";
import type { IssueRepository } from "./repository.js";
import { IssueService } from "./service.js";

describe("IssueService Inbox synchronization", () => {
  it("maps legacy Issue status updates to the corresponding Inbox state", async () => {
    const syncIssueState = vi.fn(async (_issueId, state) => ({
      item: { state },
      issue: { id: "issue-1", status: state },
    }));
    const service = new IssueService(
      {} as IssueRepository,
      {
        syncIssueState,
      } as unknown as InboxService,
    );

    await service.updateIssue("issue-1", { status: "resolved" }, "user-1");
    await service.updateIssue("issue-1", { status: "ignored" }, "user-1");
    await service.updateIssue("issue-1", { status: "unresolved" }, "user-1");

    expect(syncIssueState.mock.calls).toEqual([
      ["issue-1", "done", "user-1"],
      ["issue-1", "dismissed", "user-1"],
      ["issue-1", "open", "user-1"],
    ]);
  });

  it("preserves the legacy null result for a missing Issue", async () => {
    const service = new IssueService(
      {} as IssueRepository,
      {
        syncIssueState: vi.fn().mockResolvedValue(null),
      } as unknown as InboxService,
    );

    await expect(
      service.updateIssue("missing", { status: "resolved" }, "user-1"),
    ).resolves.toBeNull();
  });
});
