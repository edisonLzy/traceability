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

vi.mock("../../../../../main/trpc-client.js", () => ({
  createMainTrpcClient: () => ({
    projects: { list: { query: projects } },
    issues: { list: { query: list }, get: { query: get } },
  }),
}));

import extension from "../index.js";

describe("issues main extension", () => {
  it("passes projectId and returns the issue block", async () => {
    const tools: Array<{ execute: (...args: any[]) => Promise<any> }> = [];
    extension.setup({
      systemPrompt: { register: vi.fn() },
      tools: { register: (tool: any) => tools.push(tool) },
    } as any);

    const result = await tools[0]!.execute("tool-call", { projectId: "project-1" });
    expect(list).toHaveBeenCalledWith({ projectId: "project-1", limit: 20 });
    expect(result.details.assistantBlock.props.projectId).toBe("project-1");
    expect(result.details.assistantBlock.props.issues[0].eventCount).toBe(2);
  });
});
