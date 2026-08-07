import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const { list, get, events } = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
  get: vi.fn().mockResolvedValue(null),
  events: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: async () => ({
    issues: {
      list: { query: list },
      get: { query: get },
      events: { query: events },
    },
  }),
}));

import { issueCommand } from "./issue.js";

afterEach(() => {
  process.exitCode = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function run(args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  issueCommand(program);
  await program.parseAsync(["node", "traceability", "issue", ...args]);
}

describe("issue events", () => {
  it("calls issues.events with the issue id and requested limit", async () => {
    await run(["events", "issue-1", "--limit", "75"]);

    expect(events).toHaveBeenCalledWith({ issueId: "issue-1", limit: 75 });
  });

  it("defaults to limit 20", async () => {
    await run(["events", "issue-1"]);

    expect(events).toHaveBeenCalledWith({ issueId: "issue-1", limit: 20 });
  });

  it.each(["0", "101", "1.5", "nope"])("rejects invalid limit %s", async (limit) => {
    await expect(run(["events", "issue-1", "--limit", limit])).rejects.toThrow(
      "--limit must be an integer between 1 and 100",
    );
    expect(events).not.toHaveBeenCalled();
  });

  it("--json prints every field in the complete event rows, including the payload", async () => {
    const row = {
      id: "row-1",
      projectId: "project-1",
      issueId: "issue-1",
      ingestItemId: "item-1",
      eventId: "event-1",
      eventTimestamp: "2026-08-07T01:02:03.000Z",
      receivedAt: "2026-08-07T01:02:04.000Z",
      release: "1.2.3",
      environment: "staging",
      level: "error",
      traceId: "trace-1",
      spanId: "span-1",
      payload: {
        stability_drill_id: "drill-1",
        stability_scenario: "renderer-crash",
        process_type: "renderer",
        eventName: "uncaughtException",
        nested: { preserved: true },
      },
    };
    events.mockResolvedValue([row]);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["events", "issue-1", "--json"]);

    expect(JSON.parse(output.mock.calls[0]?.[0] as string)).toEqual([row]);
  });

  it("prints a readable table unless --json is passed", async () => {
    events.mockResolvedValue([
      {
        eventId: "event-1",
        eventTimestamp: "2026-08-07T01:02:03.000Z",
        receivedAt: "2026-08-07T01:02:04.000Z",
        release: "1.2.3",
        environment: "staging",
        level: "error",
        payload: { untouched: true },
      },
    ]);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["events", "issue-1"]);

    const lines = output.mock.calls.map((call) => String(call[0]));
    expect(lines[0]).toContain("EVENT ID");
    expect(lines[0]).toContain("EVENT TIME");
    expect(lines[2]).toContain("event-1");
    expect(lines[2]).toContain("staging");
  });
});

describe("unsupported issue fix-loop commands", () => {
  it.each(["fix-request", "attach-patch", "mark-fixed"])(
    "%s returns exit code 2 with an explanation",
    async (action) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await run([action, "issue-1"]);

      expect(process.exitCode).toBe(2);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("not available"));
    },
  );
});
