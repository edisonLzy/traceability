import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const { list, get } = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
  get: vi.fn().mockResolvedValue({
    traceId: "t1",
    roots: [],
    linkedEvents: [],
    metricCount: 0,
  }),
}));

vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: async () => ({
    traces: { list: { query: list }, get: { query: get } },
  }),
}));

import { traceCommand } from "./trace.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function run(args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  traceCommand(program);
  await program.parseAsync(["node", "traceability", "trace", ...args]);
}

describe("trace commands", () => {
  it("maps list options to the traces.list procedure", async () => {
    await run([
      "list",
      "--project-id",
      "p1",
      "--name",
      "checkout",
      "--op",
      "http",
      "--status",
      "ok",
      "--environment",
      "production",
      "--release",
      "1.0.0",
      "--limit",
      "10",
      "--cursor",
      "abc",
    ]);

    expect(list).toHaveBeenCalledWith({
      projectId: "p1",
      name: "checkout",
      op: "http",
      status: "ok",
      environment: "production",
      release: "1.0.0",
      limit: 10,
      cursor: "abc",
    });
  });

  it("list defaults to limit 50", async () => {
    await run(["list", "--project-id", "p1"]);
    expect(list).toHaveBeenCalledWith({ projectId: "p1", limit: 50 });
  });

  it("list requires --project-id", async () => {
    await expect(run(["list"])).rejects.toMatchObject({
      name: "CommanderError",
      code: "commander.missingMandatoryOptionValue",
    });
  });

  it("list --readable prints a table and a cursor hint", async () => {
    list.mockResolvedValue({
      data: [
        {
          traceId: "a".repeat(32),
          name: "checkout",
          op: "http",
          status: "ok",
          durationMs: 12.5,
          startTimestamp: "2026-08-05T00:00:00Z",
        },
      ],
      nextCursor: "cursor-2",
    });
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run(["list", "--project-id", "p1", "--readable"]);

    expect(output).toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith("(more results — use --cursor cursor-2)");
  });

  it("show passes projectId and traceId", async () => {
    await run(["show", "t1", "--project-id", "p1"]);
    expect(get).toHaveBeenCalledWith({ projectId: "p1", traceId: "t1" });
  });

  it("show requires --project-id", async () => {
    await expect(run(["show", "t1"])).rejects.toMatchObject({
      name: "CommanderError",
      code: "commander.missingMandatoryOptionValue",
    });
  });

  it("show --readable renders a span tree with orphan marker and footer", async () => {
    get.mockResolvedValue({
      traceId: "t1",
      roots: [
        {
          traceId: "t1",
          spanId: "s1",
          parentSpanId: null,
          name: "root",
          op: "http",
          status: "ok",
          startTimestamp: "2026-08-05T00:00:00Z",
          endTimestamp: "2026-08-05T00:00:01Z",
          durationMs: 1000,
          orphaned: false,
          children: [
            {
              traceId: "t1",
              spanId: "s2",
              parentSpanId: "s1",
              name: "child",
              op: "db",
              status: "ok",
              startTimestamp: "2026-08-05T00:00:00.1Z",
              endTimestamp: "2026-08-05T00:00:00.9Z",
              durationMs: 800,
              orphaned: false,
              children: [],
            },
          ],
        },
        {
          traceId: "t1",
          spanId: "s3",
          parentSpanId: "gone",
          name: "orphan",
          op: null,
          status: null,
          startTimestamp: "2026-08-05T00:00:00Z",
          endTimestamp: "2026-08-05T00:00:00.005Z",
          durationMs: 5,
          orphaned: true,
          children: [],
        },
      ],
      linkedEvents: [{ id: "e1" }, { id: "e2" }],
      metricCount: 3,
    });
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["show", "t1", "--project-id", "p1", "--readable"]);

    expect(output.mock.calls.map((call) => call[0])).toEqual([
      "1000ms  ok  http  root",
      "  800ms  ok  db  child",
      "5ms  -  -  orphan  [orphaned]",
      "2 linked events · 3 metrics",
    ]);
  });

  it("show defaults to JSON output", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["show", "t1", "--project-id", "p1"]);

    const printed = output.mock.calls[0]?.[0] as string;
    expect(printed).toContain('"traceId"');
  });
});
