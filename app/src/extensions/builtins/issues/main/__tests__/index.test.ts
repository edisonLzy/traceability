import { describe, expect, it, vi } from "vitest";

const { list, get, projects } = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue({
    data: [
      {
        id: "issue-1",
        projectId: "project-1",
        title: "TypeError",
        status: "unresolved",
        eventCount: 2,
      },
    ],
    nextCursor: null,
  }),
  get: vi.fn(),
  projects: vi.fn(),
}));

vi.mock("../../../../../main/trpc/client.js", () => ({
  createMainTrpcClient: () => ({
    projects: { list: { query: projects } },
    issues: { list: { query: list }, get: { query: get } },
  }),
}));

import extension from "../index.js";

describe("issues main extension", () => {
  it("keeps issue listing as a data tool and registers the UI definition", async () => {
    const tools: Array<{ execute: (...args: any[]) => Promise<any> }> = [];
    const blocks: Array<{ type: string }> = [];
    extension.setup({
      assistantBlocks: { register: (block: any) => blocks.push(block) },
      systemPrompt: { register: vi.fn() },
      tools: { register: (tool: any) => tools.push(tool) },
    } as any);

    const result = await tools[0]!.execute("tool-call", { projectId: "project-1" });
    expect(list).toHaveBeenCalledWith({ projectId: "project-1", limit: 20 });
    expect(blocks[0]?.type).toBe("issues.list");
    expect(result.details).toEqual({});
    expect(result.content[0].text).toContain("TypeError");
  });
});
