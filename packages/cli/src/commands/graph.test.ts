import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const { list, get, create, applyOperations } = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([
    {
      id: "graph-1",
      title: "Checkout Bug Graph",
      status: "active",
      version: 1,
      nodeCount: 2,
      edgeCount: 1,
      createdAt: "2026-08-30T00:00:00Z",
      updatedAt: "2026-08-30T00:00:00Z",
    },
  ]),
  get: vi.fn().mockResolvedValue({
    id: "graph-1",
    projectId: "project-1",
    title: "Checkout Bug Graph",
    status: "active",
    version: 1,
    nodes: [
      {
        id: "yt-1",
        type: "youtube",
        position: { x: 80, y: 80 },
        data: {
          kind: "youtube",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "Repro Video",
        },
      },
    ],
    edges: [],
    updatedAt: "2026-08-30T00:00:00Z",
  }),
  create: vi.fn().mockResolvedValue({
    id: "graph-1",
    projectId: "project-1",
    title: "New Investigation Graph",
    status: "active",
    version: 0,
    nodeCount: 0,
    edgeCount: 0,
    createdAt: "2026-08-30T00:00:00Z",
    updatedAt: "2026-08-30T00:00:00Z",
  }),
  applyOperations: vi.fn().mockResolvedValue({
    graphId: "graph-1",
    version: 2,
    alreadyApplied: false,
    idMappings: { tmp_1: "yt-node-uuid" },
    applied: [{ op: "createNode", id: "tmp_1", nodeId: "yt-node-uuid" }],
  }),
}));

vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: async () => ({
    graphs: {
      list: { query: list },
      get: { query: get },
      create: { mutate: create },
      applyOperations: { mutate: applyOperations },
    },
  }),
}));

import { graphCommand } from "./graph.js";

afterEach(() => vi.restoreAllMocks());

async function run(args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  graphCommand(program);
  await program.parseAsync(["node", "traceability", "graph", ...args]);
}

describe("CLI graph commands", () => {
  it("lists graphs for a project", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await run(["list", "--project-id", "project-1"]);

    expect(list).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(logSpy).toHaveBeenCalled();
  });

  it("adds a youtube node with url, title, and duration", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run([
      "node",
      "add",
      "graph-1",
      "--project-id",
      "project-1",
      "--type",
      "youtube",
      "--url",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "--video-title",
      "Repro Video Demo",
      "--duration",
      "270",
      "--start-time",
      "15",
    ]);

    expect(applyOperations).toHaveBeenCalledOnce();
    const callArg = applyOperations.mock.calls[0][0];
    expect(callArg.projectId).toBe("project-1");
    expect(callArg.graphId).toBe("graph-1");
    expect(callArg.operations[0]).toMatchObject({
      op: "createNode",
      type: "youtube",
      data: {
        kind: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Repro Video Demo",
        duration: 270,
        startTime: 15,
      },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Added youtube node (yt-node-uuid). Graph version 2."),
    );
  });
});
