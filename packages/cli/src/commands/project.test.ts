import { Command, CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

const { list, create, listConnections, get, update, remove } = vi.hoisted(() => ({
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
  get: vi.fn().mockResolvedValue({ id: "project-1", slug: "checkout-web", enabled: true }),
  update: vi.fn().mockResolvedValue({ id: "project-1", slug: "checkout-web", enabled: true }),
  remove: vi.fn().mockResolvedValue({ id: "project-1", slug: "checkout-web" }),
}));

vi.mock("../lib/trpc.js", () => ({
  getTrpcClient: async () => ({
    projects: {
      list: { query: list },
      create: { mutate: create },
      listConnections: { query: listConnections },
      get: { query: get },
      update: { mutate: update },
      remove: { mutate: remove },
    },
  }),
}));

import { projectCommand } from "./project.js";

afterEach(() => vi.restoreAllMocks());

async function run(args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  projectCommand(program);
  await program.parseAsync(["node", "traceability", "project", ...args]);
}

describe("project commands", () => {
  it("lists projects through the commander action dispatcher", async () => {
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

  it("rejects the removed dsn subcommand as an unknown command", async () => {
    await expect(run(["dsn", "project-1"])).rejects.toBeInstanceOf(CommanderError);
  });

  it("show returns the project together with its connections", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["show", "project-1"]);

    expect(get).toHaveBeenCalledWith("project-1");
    expect(listConnections).toHaveBeenCalledWith("project-1");
    const printed = output.mock.calls[0]?.[0] as string;
    expect(printed).toContain('"project"');
    expect(printed).toContain('"connections"');
    expect(printed).toContain("http://public-key@ingest.example/1");
  });

  it("requires --slug and --name for create", async () => {
    await expect(run(["create"])).rejects.toMatchObject({
      name: "CommanderError",
      code: "commander.missingMandatoryOptionValue",
    });
  });

  it("rejects the removed app alias as an unknown command", async () => {
    await expect(run(["app", "list"])).rejects.toBeInstanceOf(CommanderError);
  });
});
