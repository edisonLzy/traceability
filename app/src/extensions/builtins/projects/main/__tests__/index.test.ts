import { describe, expect, it, vi } from "vitest";

const { list } = vi.hoisted(() => ({
  list: vi
    .fn()
    .mockResolvedValue([
      { id: "project-1", slug: "checkout-web", name: "Checkout Web", platform: "javascript" },
    ]),
}));

vi.mock("../../../../../main/trpc-client.js", () => ({
  createMainTrpcClient: () => ({ projects: { list: { query: list } } }),
}));

import extension from "../index.js";

describe("projects main extension", () => {
  it("registers a tool backed by projects.list", async () => {
    const tools: Array<{ execute: (...args: any[]) => Promise<any> }> = [];
    extension.setup({
      systemPrompt: { register: vi.fn() },
      tools: { register: (tool: any) => tools.push(tool) },
    } as any);

    const result = await tools[0]!.execute("tool-call", {});
    expect(list).toHaveBeenCalledOnce();
    expect(result.details.assistantBlock.props.projects[0].slug).toBe("checkout-web");
  });
});
