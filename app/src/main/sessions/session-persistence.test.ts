import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Entry } from "../../shared/session-persistence-ipc.js";
import { JsonlSessionStore } from "./jsonl-session-store.js";

const electron = vi.hoisted(() => ({ userDataDirectory: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => electron.userDataDirectory },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

const { SessionPersistence } = await import("./session-persistence.js");

function createFakeBrowserWindow() {
  return {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: vi.fn() },
  } as never;
}

function entry(
  id: string,
  sessionId: string,
  parentId: string | null,
  data: Record<string, unknown>,
  type: Entry["type"] = "message",
): Entry {
  return { id, sessionId, parentId, type, timestamp: Date.now(), data };
}

describe("SessionPersistence JSONL store", () => {
  let userDataDirectory: string;
  let sessionDirectory: string;
  const persistences: Array<InstanceType<typeof SessionPersistence>> = [];

  beforeEach(() => {
    userDataDirectory = mkdtempSync(join(tmpdir(), "traceability-session-test-"));
    sessionDirectory = join(userDataDirectory, "sessions");
    electron.userDataDirectory = userDataDirectory;
  });

  afterEach(() => {
    for (const persistence of persistences.splice(0)) persistence.destroyAll();
    rmSync(userDataDirectory, { recursive: true, force: true });
  });

  function createPersistence() {
    const persistence = new SessionPersistence(createFakeBrowserWindow(), sessionDirectory);
    persistences.push(persistence);
    return persistence;
  }

  it("stores each session as an append-only JSONL file and restores it after reopen", async () => {
    const persistence = createPersistence();
    const session = await persistence.createSession("issues");

    await persistence.renameSession(session.id, "Investigate checkout failure");
    await persistence.appendSessionEntries(session.id, [
      entry("m1", session.id, null, { role: "user", content: "Investigate" }),
      entry("m2", session.id, "m1", { role: "assistant", content: "Looking into it" }),
    ]);

    const filePath = join(sessionDirectory, "issues", `${session.id}.jsonl`);
    const records = readFileSync(filePath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    expect(records.map((record) => record.type)).toEqual(["session", "metadata", "entries"]);

    persistence.destroyAll();
    persistences.splice(persistences.indexOf(persistence), 1);
    const restored = createPersistence();

    expect(await restored.listSessions("issues")).toMatchObject([
      { id: session.id, name: "Investigate checkout failure", leafEntryId: "m2" },
    ]);
    expect((await restored.getSessionEntries(session.id)).map((stored) => stored.id)).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("round-trips durable assistant-block messages", async () => {
    const persistence = createPersistence();
    const session = await persistence.createSession("agent");
    const block = {
      role: "assistantBlock",
      block: { type: "issues.list", props: { status: "unresolved", limit: 20 } },
      timestamp: 3,
      toolCallId: "render-1",
      toolName: "render_ui",
    };

    await persistence.appendSessionEntries(session.id, [entry("ui-1", session.id, null, block)]);

    persistence.destroyAll();
    persistences.splice(persistences.indexOf(persistence), 1);
    const restored = createPersistence();
    expect((await restored.getBranch(session.id))[0]?.data).toEqual(block);
  });

  it("keeps all history while resolving the active branch and context", async () => {
    const persistence = createPersistence();
    const session = await persistence.createSession("agent");
    await persistence.appendSessionEntries(session.id, [
      entry("r1", session.id, null, { role: "user", content: "original" }),
      entry("r2", session.id, "r1", { role: "assistant", content: "reply" }),
      entry("r3", session.id, "r2", { role: "user", content: "old branch" }),
    ]);
    await persistence.setLeaf(session.id, "r2");
    await persistence.appendSessionEntries(session.id, [
      entry("r4", session.id, "r2", { role: "user", content: "new branch" }),
      entry("r5", session.id, "r4", { providerId: "openai", modelId: "gpt-5" }, "model_change"),
    ]);

    expect((await persistence.getBranch(session.id)).map((stored) => stored.id)).toEqual([
      "r1",
      "r2",
      "r4",
      "r5",
    ]);
    expect((await persistence.getSessionEntries(session.id)).map((stored) => stored.id)).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
      "r5",
    ]);
    await expect(persistence.buildContext(session.id)).resolves.toMatchObject({
      messages: [
        { id: "r1", content: "original" },
        { id: "r2", content: "reply" },
        { id: "r4", content: "new branch" },
      ],
      model: { providerId: "openai", modelId: "gpt-5" },
    });
  });

  it("validates parents and leaf ownership, then deletes the complete session file", async () => {
    const persistence = createPersistence();
    const sessionA = await persistence.createSession("agent");
    const sessionB = await persistence.createSession("agent");
    await persistence.appendSessionEntries(sessionA.id, [
      entry("a1", sessionA.id, null, { role: "user", content: "hello" }),
    ]);

    await expect(
      persistence.appendSessionEntries(sessionB.id, [
        entry("orphan", sessionB.id, "missing", { role: "user", content: "orphan" }),
      ]),
    ).rejects.toThrow("Parent entry not found");
    await expect(persistence.setLeaf(sessionB.id, "a1")).rejects.toThrow("does not belong");

    await persistence.deleteSession(sessionA.id);
    expect(await persistence.getSession(sessionA.id)).toBeNull();
    expect(await persistence.getSessionEntries(sessionA.id)).toEqual([]);
  });

  it("drops an interrupted final line without losing prior records", async () => {
    const persistence = createPersistence();
    const session = await persistence.createSession("agent");
    await persistence.appendSessionEntries(session.id, [
      entry("safe", session.id, null, { role: "user", content: "durable" }),
    ]);
    const filePath = join(sessionDirectory, "agent", `${session.id}.jsonl`);
    writeFileSync(filePath, '{"type":"entries"', { flag: "a" });

    persistence.destroyAll();
    persistences.splice(persistences.indexOf(persistence), 1);
    const restored = createPersistence();

    expect((await restored.getSessionEntries(session.id)).map((stored) => stored.id)).toEqual([
      "safe",
    ]);
    expect(readFileSync(filePath, "utf8")).toMatch(/\n$/);
  });

  it("imports an existing SQLite session once when JSONL storage is first created", () => {
    const legacyPath = join(userDataDirectory, "traceability-agent.sqlite");
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec(`
      CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY, app_id TEXT NOT NULL, name TEXT NOT NULL,
        title TEXT, cwd TEXT, workspace_id TEXT, parent_session_id TEXT,
        leaf_entry_id TEXT, is_top INTEGER NOT NULL, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE agent_entries (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        parent_id TEXT, type TEXT NOT NULL, data_json TEXT NOT NULL,
        token_usage_json TEXT, timestamp INTEGER, created_at INTEGER NOT NULL
      );
    `);
    legacy
      .prepare("INSERT INTO agent_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "legacy-session",
        "legacy-app",
        "Old session",
        "",
        "",
        null,
        null,
        "legacy-entry",
        0,
        1,
        2,
      );
    legacy
      .prepare("INSERT INTO agent_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "legacy-entry",
        "legacy-session",
        1,
        null,
        "message",
        '{"role":"user","content":"preserved"}',
        null,
        1,
        1,
      );
    legacy.close();

    const store = new JsonlSessionStore(sessionDirectory, legacyPath);
    expect(store.list("legacy-app")).toMatchObject([
      { id: "legacy-session", name: "Old session", leafEntryId: "legacy-entry" },
    ]);
    expect(store.getBranch("legacy-session").map((stored) => stored.id)).toEqual(["legacy-entry"]);
  });
});
