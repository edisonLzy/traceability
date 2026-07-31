import { cac } from "cac";
import { afterEach, describe, expect, it, vi } from "vitest";

const { list, create, listConnections } = vi.hoisted(() => ({
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
  listConnections: vi
    .fn()
    .mockResolvedValue([
      { key: { id: "key-1", status: "active" }, dsn: "http://public-key@ingest.example/1" },
    ]),
}));

vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: async () => ({
    projects: {
      list: { query: list },
      create: { mutate: create },
      listConnections: { query: listConnections },
    },
  }),
}));

import { projectCommand } from "./project.js";

afterEach(() => vi.restoreAllMocks());

async function run(args: string[]): Promise<void> {
  const cli = cac("traceability");
  projectCommand(cli);
  cli.parse(["node", "traceability", "project", ...args], { run: false });
  await cli.runMatchedCommand();
}

describe("project commands", () => {
  it("lists projects through the CAC action dispatcher", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["list"]);

    expect(list).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalled();
  });

  it("creates a project with slug and name", async () => {
    await run(["create", "--slug", "checkout-web", "--name", "Checkout Web"]);

    expect(create).toHaveBeenCalledWith({
      slug: "checkout-web",
      name: "Checkout Web",
      platform: "javascript",
    });
  });

  it("does not register the removed app alias", async () => {
    const cli = cac("traceability");
    projectCommand(cli);
    cli.parse(["node", "traceability", "app", "list"], { run: false });

    expect(cli.matchedCommand).toBeUndefined();
  });

  it("returns every project DSN through the explicit dsn action", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["dsn", "project-1"]);

    expect(listConnections).toHaveBeenCalledWith("project-1");
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining("http://public-key@ingest.example/1"),
    );
  });
});
