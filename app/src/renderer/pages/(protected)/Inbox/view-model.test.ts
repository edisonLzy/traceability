import { describe, expect, it } from "vitest";

import { activityDescription, inboxStateLabel, shortIssueId } from "./view-model";

describe("Inbox view model", () => {
  it("uses the three-state MVP labels", () => {
    expect(inboxStateLabel("open")).toBe("Open");
    expect(inboxStateLabel("done")).toBe("Done");
    expect(inboxStateLabel("dismissed")).toBe("Dismissed");
  });

  it("turns durable activity payloads into readable timeline copy", () => {
    const base = {
      id: "activity-1",
      inboxItemId: "item-1",
      actorType: "system" as const,
      actorId: null,
      createdAt: new Date().toISOString(),
    };

    expect(
      activityDescription({
        ...base,
        type: "state_changed",
        payload: { fromState: "done", toState: "open", reason: "issue_regressed" },
      }),
    ).toBe("Issue recurred and returned to Open");
    expect(
      activityDescription({
        ...base,
        type: "state_changed",
        payload: { fromState: "open", toState: "dismissed" },
      }),
    ).toBe("Dismissed and ignored the linked issue");
  });

  it("creates a compact stable issue label", () => {
    expect(shortIssueId("10000000-0000-4000-8000-000000000001")).toBe("10000000");
  });
});
