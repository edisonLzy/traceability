import { describe, expect, it, vi } from "vitest";

const { list } = vi.hoisted(() => ({
  list: vi
    .fn()
    .mockResolvedValue([
      { id: "project-1", slug: "checkout-web", name: "Checkout Web", platform: "javascript" },
    ]),
}));

vi.mock("../../../../../main/trpc/client.js", () => ({
  createMainTrpcClient: () => ({ projects: { list: { query: list } } }),
}));

import extension from "../index.js";

describe("projects main extension", () => {
  it("registers a tool backed by projects.list", async () => {
    const tools: Array<{ execute: (...args: any[]) => Promise<any> }> = [];
    const blocks: Array<{ type: string }> = [];
    extension.setup({
      assistantBlocks: { register: (block: any) => blocks.push(block) },
      systemPrompt: { register: vi.fn() },
      tools: { register: (tool: any) => tools.push(tool) },
    } as any);

    const result = await tools[0]!.execute("tool-call", {});
    expect(list).toHaveBeenCalledOnce();
    expect(blocks[0]?.type).toBe("projects.list");
    expect(result.details).toEqual({});
    expect(result.content[0].text).toContain("Checkout Web");
  });
});
