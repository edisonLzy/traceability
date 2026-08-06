import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const { catalog, series, groups } = vi.hoisted(() => ({
  catalog: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
  series: vi.fn().mockResolvedValue({
    type: "counter",
    unit: null,
    points: [],
    summary: null,
  }),
  groups: vi.fn().mockResolvedValue({
    type: "counter",
    unit: null,
    groupBy: "path",
    groups: [],
  }),
}));

vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: async () => ({
    metrics: {
      catalog: { query: catalog },
      series: { query: series },
      groups: { query: groups },
    },
  }),
}));

import { metricCommand } from "./metric.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function run(args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  metricCommand(program);
  await program.parseAsync(["node", "traceability", "metric", ...args]);
}

describe("metric commands", () => {
  it("maps list options to the catalog procedure", async () => {
    await run([
      "list",
      "--project-id",
      "p1",
      "--prefix",
      "chat",
      "--type",
      "counter",
      "--limit",
      "10",
      "--cursor",
      "abc",
    ]);

    expect(catalog).toHaveBeenCalledWith({
      projectId: "p1",
      prefix: "chat",
      type: "counter",
      limit: 10,
      cursor: "abc",
    });
  });

  it("list defaults to limit 50 without time or cursor", async () => {
    await run(["list", "--project-id", "p1"]);
    expect(catalog).toHaveBeenCalledWith({ projectId: "p1", limit: 50 });
  });

  it("list requires --project-id", async () => {
    await expect(run(["list"])).rejects.toMatchObject({
      name: "CommanderError",
      code: "commander.missingMandatoryOptionValue",
    });
  });

  it("list --readable prints a table and a cursor hint", async () => {
    catalog.mockResolvedValue({
      data: [
        {
          name: "chat.sent",
          type: "counter",
          unit: "none",
          sampleCount: 12,
          lastSeen: "2026-08-05T00:00:00Z",
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

  it("series passes name/type/unit/resolution through", async () => {
    await run([
      "series",
      "--project-id",
      "p1",
      "--name",
      "chat.sent",
      "--type",
      "counter",
      "--unit",
      "none",
      "--resolution",
      "5m",
    ]);

    expect(series).toHaveBeenCalledWith({
      projectId: "p1",
      name: "chat.sent",
      type: "counter",
      unit: "none",
      resolution: "5m",
      attributes: {},
    });
  });

  it("series resolves type/unit from a single catalog candidate", async () => {
    catalog.mockResolvedValue({
      data: [
        {
          name: "chat.sent",
          type: "counter",
          unit: "none",
          sampleCount: 1,
          lastSeen: "2026-08-05T00:00:00Z",
        },
      ],
      nextCursor: null,
    });

    await run(["series", "--project-id", "p1", "--name", "chat.sent"]);

    expect(catalog).toHaveBeenCalledWith({ projectId: "p1", prefix: "chat.sent", limit: 100 });
    expect(series).toHaveBeenCalledWith(
      expect.objectContaining({ name: "chat.sent", type: "counter", unit: "none" }),
    );
  });

  it("series errors when the metric is not in the catalog", async () => {
    catalog.mockResolvedValue({ data: [], nextCursor: null });

    await expect(run(["series", "--project-id", "p1", "--name", "nope"])).rejects.toThrow(
      /No metric named "nope"/,
    );
  });

  it("series errors when the catalog is ambiguous", async () => {
    catalog.mockResolvedValue({
      data: [
        {
          name: "latency",
          type: "gauge",
          unit: "ms",
          sampleCount: 1,
          lastSeen: "2026-08-05T00:00:00Z",
        },
        {
          name: "latency",
          type: "distribution",
          unit: "ms",
          sampleCount: 1,
          lastSeen: "2026-08-05T00:00:00Z",
        },
      ],
      nextCursor: null,
    });

    await expect(run(["series", "--project-id", "p1", "--name", "latency"])).rejects.toThrow(
      /ambiguous/,
    );
  });

  it("series parses --attr values into typed attributes", async () => {
    await run([
      "series",
      "--project-id",
      "p1",
      "--name",
      "chat.sent",
      "--type",
      "counter",
      "--unit",
      "none",
      "--attr",
      "sessionType=private",
      "--attr",
      "attempt=3",
      "--attr",
      "flag=true",
    ]);

    expect(series).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: { sessionType: "private", attempt: 3, flag: true },
      }),
    );
  });

  it("series rejects an invalid --type", async () => {
    await expect(
      run(["series", "--project-id", "p1", "--name", "x", "--type", "bogus"]),
    ).rejects.toThrow(/Invalid --type/);
  });

  it("series --group-by calls the groups procedure with order/limit", async () => {
    await run([
      "series",
      "--project-id",
      "p1",
      "--name",
      "chat.sent",
      "--type",
      "counter",
      "--unit",
      "none",
      "--group-by",
      "path",
      "--order-by",
      "p95",
      "--order-asc",
      "--limit",
      "10",
    ]);

    expect(groups).toHaveBeenCalledWith({
      projectId: "p1",
      name: "chat.sent",
      type: "counter",
      unit: "none",
      groupBy: "path",
      orderBy: "p95",
      orderDesc: false,
      limit: 10,
      attributes: {},
    });
    expect(series).not.toHaveBeenCalled();
  });

  it("series --group-by defaults order to count desc and limit 50", async () => {
    await run([
      "series",
      "--project-id",
      "p1",
      "--name",
      "chat.sent",
      "--type",
      "counter",
      "--unit",
      "none",
      "--group-by",
      "path",
    ]);

    expect(groups).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: "path", orderBy: "count", orderDesc: true, limit: 50 }),
    );
    expect(series).not.toHaveBeenCalled();
  });

  it("series --group-by --readable prints a group summary line and table", async () => {
    groups.mockResolvedValue({
      type: "distribution",
      unit: "millisecond",
      groupBy: "path",
      groups: [
        {
          value: "/a",
          count: 5,
          sum: 100,
          min: 1,
          max: 9,
          avg: 5,
          p50: 5,
          p95: 8.6,
          p99: 8.96,
        },
      ],
    });
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run([
      "series",
      "--project-id",
      "p1",
      "--name",
      "latency",
      "--type",
      "distribution",
      "--unit",
      "millisecond",
      "--group-by",
      "path",
      "--readable",
    ]);

    expect(output).toHaveBeenCalled();
    expect(output.mock.calls[0]?.[0]).toContain("grouped by path");
  });

  it("series --group-by rejects an invalid --order-by", async () => {
    await expect(
      run([
        "series",
        "--project-id",
        "p1",
        "--name",
        "x",
        "--type",
        "counter",
        "--unit",
        "none",
        "--group-by",
        "path",
        "--order-by",
        "bogus",
      ]),
    ).rejects.toThrow(/Invalid --order-by/);
  });
});
