import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const { list, create } = vi.hoisted(() => ({
  list: vi
    .fn()
    .mockResolvedValue([
      { id: "project-1", slug: "checkout-web", name: "Checkout Web", enabled: true },
    ]),
  create: vi.fn().mockResolvedValue({
    project: { id: "project-1", slug: "checkout-web" },
    key: { publicKey: "public-key" },
    dsn: "http://localhost:3000",
  }),
}));

vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: () => ({
    projects: {
      list: { query: list },
      create: { mutate: create },
    },
  }),
}));

import { projectCommand } from "./project.js";

afterEach(() => vi.restoreAllMocks());

describe("project commands", () => {
  it("lists projects", async () => {
    const program = new Command();
    projectCommand(program);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await program.parseAsync(["node", "traceability", "project", "list"]);

    expect(list).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalled();
  });

  it("creates a project with slug and name", async () => {
    const program = new Command();
    projectCommand(program);

    await program.parseAsync([
      "node",
      "traceability",
      "project",
      "create",
      "--slug",
      "checkout-web",
      "--name",
      "Checkout Web",
    ]);

    expect(create).toHaveBeenCalledWith({
      slug: "checkout-web",
      name: "Checkout Web",
      platform: "javascript",
    });
  });
});
