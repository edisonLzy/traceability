import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { Entry, Session, TokenUsage } from "../../shared/session-persistence-ipc.js";

const require = createRequire(import.meta.url);
const FORMAT_VERSION = 1;

interface SessionHeaderRecord {
  type: "session";
  version: number;
  session: Session;
}

interface EntriesRecord {
  type: "entries";
  entries: Entry[];
  leafEntryId: string | null;
  updatedAt: number;
}

interface MetadataRecord {
  type: "metadata";
  name: string;
  updatedAt: number;
}

interface LeafRecord {
  type: "leaf";
  leafEntryId: string | null;
  updatedAt: number;
}

type SessionRecord = SessionHeaderRecord | EntriesRecord | MetadataRecord | LeafRecord;

interface SessionState {
  entries: Entry[];
  entriesById: Map<string, Entry>;
  filePath: string;
  session: Session;
}

/**
 * The desktop's append-only session store. Each session owns a small JSONL
 * event stream, so a broken or partial final write cannot invalidate previous
 * session history.
 */
export class JsonlSessionStore {
  private readonly states = new Map<string, SessionState>();

  constructor(
    private readonly rootDirectory: string,
    legacyDatabasePath?: string,
  ) {
    this.migrateLegacyDatabaseIfNeeded(legacyDatabasePath);
    mkdirSync(this.rootDirectory, { recursive: true, mode: 0o700 });
    this.loadAll();
  }

  create(session: Session): Session {
    if (this.states.has(session.id)) {
      throw new Error(`Session already exists: ${session.id}`);
    }

    const filePath = this.filePath(session.projectId, session.id);
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    this.writeNewFile(filePath, [{ type: "session", version: FORMAT_VERSION, session }]);
    this.states.set(session.id, this.createState(session, filePath));
    return clone(session);
  }

  list(projectId: string): Session[] {
    return [...this.states.values()]
      .map((state) => state.session)
      .filter((session) => session.projectId === projectId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(clone);
  }

  get(sessionId: string): Session | null {
    const state = this.states.get(sessionId);
    return state ? clone(state.session) : null;
  }

  getEntries(sessionId: string): Entry[] {
    const state = this.states.get(sessionId);
    return state ? state.entries.map(clone) : [];
  }

  appendEntries(sessionId: string, inputEntries: Entry[]): void {
    const state = this.requireState(sessionId);
    if (inputEntries.length === 0) return;

    const incomingIds = new Set(inputEntries.map((entry) => entry.id));
    for (const entry of inputEntries) {
      if (
        entry.parentId &&
        !state.entriesById.has(entry.parentId) &&
        !incomingIds.has(entry.parentId)
      ) {
        throw new Error(
          `Parent entry not found: ${entry.parentId} (session ${sessionId}, entry ${entry.id})`,
        );
      }
    }

    const entries = inputEntries.map((entry) => ({ ...clone(entry), sessionId }));
    const lastEntry = entries.at(-1);
    const now = Date.now();
    this.appendRecord(state, {
      type: "entries",
      entries,
      leafEntryId: lastEntry?.id ?? null,
      updatedAt: now,
    });
    this.applyEntries(state, entries);
    state.session.leafEntryId = lastEntry?.id ?? null;
    state.session.updatedAt = now;
  }

  rename(sessionId: string, name: string): void {
    const state = this.states.get(sessionId);
    if (!state) return;

    const updatedAt = Date.now();
    this.appendRecord(state, { type: "metadata", name, updatedAt });
    state.session.name = name;
    state.session.updatedAt = updatedAt;
  }

  delete(sessionId: string): void {
    const state = this.states.get(sessionId);
    if (!state) return;
    rmSync(state.filePath, { force: true });
    this.states.delete(sessionId);
  }

  setLeaf(sessionId: string, entryId: string): void {
    const owner = this.findEntryOwner(entryId);
    if (!owner) throw new Error(`Entry not found: ${entryId}`);
    if (owner.session.id !== sessionId) {
      throw new Error(`Entry ${entryId} does not belong to session ${sessionId}`);
    }

    const updatedAt = Date.now();
    this.appendRecord(owner, { type: "leaf", leafEntryId: entryId, updatedAt });
    owner.session.leafEntryId = entryId;
    owner.session.updatedAt = updatedAt;
  }

  getBranch(sessionId: string, leafId?: string): Entry[] {
    const state = this.states.get(sessionId);
    const targetLeafId = leafId ?? state?.session.leafEntryId;
    if (!state || !targetLeafId) return [];

    const branch: Entry[] = [];
    let currentId: string | null | undefined = targetLeafId;
    while (currentId) {
      const entry = state.entriesById.get(currentId);
      if (!entry) break;
      branch.push(entry);
      currentId = entry.parentId;
    }
    return branch.reverse().map(clone);
  }

  close(): void {
    // Writes are synchronous and fsynced before mutating state, so there is no
    // pending resource to close. The method preserves LocalDatabase's lifecycle
    // contract for SessionPersistence.
  }

  private requireState(sessionId: string): SessionState {
    const state = this.states.get(sessionId);
    if (!state) throw new Error(`Session not found: ${sessionId}`);
    return state;
  }

  private filePath(projectId: string, sessionId: string): string {
    return join(this.rootDirectory, encodeURIComponent(projectId), `${sessionId}.jsonl`);
  }

  private createState(session: Session, filePath: string): SessionState {
    return {
      entries: [],
      entriesById: new Map(),
      filePath,
      session: clone(session),
    };
  }

  private writeNewFile(filePath: string, records: SessionRecord[]): void {
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const fileDescriptor = openSync(temporaryPath, "w", 0o600);
    try {
      writeFileSync(fileDescriptor, records.map(serializeRecord).join(""), "utf8");
      fsyncSync(fileDescriptor);
    } finally {
      closeSync(fileDescriptor);
    }
    renameSync(temporaryPath, filePath);
  }

  private appendRecord(
    state: SessionState,
    record: Exclude<SessionRecord, SessionHeaderRecord>,
  ): void {
    const fileDescriptor = openSync(state.filePath, "a", 0o600);
    try {
      writeFileSync(fileDescriptor, serializeRecord(record), "utf8");
      fsyncSync(fileDescriptor);
    } finally {
      closeSync(fileDescriptor);
    }
  }

  private loadAll(): void {
    for (const directory of readdirSync(this.rootDirectory, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      const appDirectory = join(this.rootDirectory, directory.name);
      for (const file of readdirSync(appDirectory, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        this.loadFile(join(appDirectory, file.name));
      }
    }
  }

  private loadFile(filePath: string): void {
    const raw = readFileSync(filePath, "utf8");
    const lastNewline = raw.lastIndexOf("\n");
    if (lastNewline === -1) {
      if (raw.length > 0) truncateSync(filePath, 0);
      return;
    }

    const complete = raw.slice(0, lastNewline + 1);
    if (complete.length !== raw.length) {
      truncateSync(filePath, Buffer.byteLength(complete));
    }

    const lines = complete.split("\n").filter(Boolean);
    if (lines.length === 0) return;
    const header = parseRecord(lines[0]!, filePath);
    if (header.type !== "session") {
      throw new Error(`Session file ${filePath} does not start with a session header`);
    }
    const state = this.createState(header.session, filePath);
    for (const line of lines.slice(1)) {
      this.applyRecord(state, parseRecord(line, filePath));
    }
    if (this.states.has(state.session.id)) {
      throw new Error(`Duplicate session id ${state.session.id} in ${filePath}`);
    }
    this.states.set(state.session.id, state);
  }

  private applyRecord(state: SessionState, record: SessionRecord): void {
    switch (record.type) {
      case "session":
        throw new Error(`Unexpected session header in ${state.filePath}`);
      case "entries":
        this.applyEntries(state, record.entries);
        state.session.leafEntryId = record.leafEntryId;
        state.session.updatedAt = record.updatedAt;
        return;
      case "metadata":
        state.session.name = record.name;
        state.session.updatedAt = record.updatedAt;
        return;
      case "leaf":
        state.session.leafEntryId = record.leafEntryId;
        state.session.updatedAt = record.updatedAt;
    }
  }

  private applyEntries(state: SessionState, entries: Entry[]): void {
    for (const entry of entries) {
      if (entry.sessionId !== state.session.id) {
        throw new Error(`Entry ${entry.id} belongs to a different session in ${state.filePath}`);
      }
      if (state.entriesById.has(entry.id)) continue;
      state.entries.push(clone(entry));
      state.entriesById.set(entry.id, state.entries.at(-1)!);
    }
  }

  private findEntryOwner(entryId: string): SessionState | undefined {
    return [...this.states.values()].find((state) => state.entriesById.has(entryId));
  }

  private migrateLegacyDatabaseIfNeeded(legacyDatabasePath: string | undefined): void {
    if (existsSync(this.rootDirectory) || !legacyDatabasePath || !existsSync(legacyDatabasePath))
      return;

    const stagingDirectory = `${this.rootDirectory}.import-${process.pid}-${Date.now()}`;
    mkdirSync(stagingDirectory, { recursive: true, mode: 0o700 });
    try {
      const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
      const legacy = new DatabaseSync(legacyDatabasePath, { timeout: 5000 });
      try {
        if (hasTable(legacy, "agent_sessions")) {
          const sessions = legacy.prepare("SELECT * FROM agent_sessions").all() as LegacyRow[];
          const entries = hasTable(legacy, "agent_entries")
            ? (legacy.prepare("SELECT * FROM agent_entries").all() as LegacyRow[])
            : [];
          for (const row of sessions) {
            const session = legacySession(row);
            const sessionEntries = entries
              .filter((entry) => stringValue(entry.session_id) === session.id)
              .sort((left, right) => numberValue(left.sequence) - numberValue(right.sequence));
            let previousId: string | null = null;
            const normalizedEntries = sessionEntries.map((entry) => {
              const normalized = legacyEntry(entry, session.id, previousId);
              previousId = normalized.id;
              return normalized;
            });
            if (!session.leafEntryId && previousId) session.leafEntryId = previousId;

            const filePath = join(
              stagingDirectory,
              encodeURIComponent(session.projectId),
              `${session.id}.jsonl`,
            );
            mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
            const records: SessionRecord[] = [
              { type: "session", version: FORMAT_VERSION, session },
            ];
            if (normalizedEntries.length > 0) {
              records.push({
                type: "entries",
                entries: normalizedEntries,
                leafEntryId: session.leafEntryId,
                updatedAt: session.updatedAt,
              });
            }
            this.writeNewFile(filePath, records);
          }
        }
      } finally {
        legacy.close();
      }
      renameSync(stagingDirectory, this.rootDirectory);
    } catch (error) {
      rmSync(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }
}

type LegacyRow = Record<string, unknown>;

function hasTable(
  database: { prepare(sql: string): { get(name: string): unknown } },
  name: string,
) {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function legacySession(row: LegacyRow): Session {
  return {
    id: stringValue(row.id),
    projectId: stringValue(row.app_id),
    name: stringValue(row.name) || stringValue(row.title),
    cwd: stringValue(row.cwd),
    workspaceId: nullableString(row.workspace_id),
    parentSessionId: nullableString(row.parent_session_id),
    leafEntryId: nullableString(row.leaf_entry_id),
    createdAt: numberValue(row.created_at),
    updatedAt: numberValue(row.updated_at) || numberValue(row.created_at),
    isTop: numberValue(row.is_top) === 1,
  };
}

function legacyEntry(row: LegacyRow, sessionId: string, fallbackParentId: string | null): Entry {
  return {
    id: stringValue(row.id),
    sessionId,
    parentId: nullableString(row.parent_id) ?? fallbackParentId,
    type: stringValue(row.type) === "model_change" ? "model_change" : "message",
    timestamp: numberValue(row.timestamp) || numberValue(row.created_at),
    data: parseObject(row.data_json),
    tokenUsage: parseTokenUsage(row.token_usage_json),
  };
}

function parseRecord(line: string, filePath: string): SessionRecord {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`Invalid JSONL record in ${filePath}`);
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(`Invalid JSONL record in ${filePath}`);
  }
  switch (value.type) {
    case "session":
      if (!isRecord(value.session)) throw new Error(`Invalid session header in ${filePath}`);
      return {
        type: "session",
        version: numberValue(value.version) || FORMAT_VERSION,
        session: parseSession(value.session),
      };
    case "entries":
      if (!Array.isArray(value.entries)) throw new Error(`Invalid entries record in ${filePath}`);
      return {
        type: "entries",
        entries: value.entries.map((entry) => parseEntry(entry, filePath)),
        leafEntryId: nullableString(value.leafEntryId),
        updatedAt: numberValue(value.updatedAt),
      };
    case "metadata":
      return {
        type: "metadata",
        name: stringValue(value.name),
        updatedAt: numberValue(value.updatedAt),
      };
    case "leaf":
      return {
        type: "leaf",
        leafEntryId: nullableString(value.leafEntryId),
        updatedAt: numberValue(value.updatedAt),
      };
    default:
      throw new Error(`Unknown JSONL record type ${value.type} in ${filePath}`);
  }
}

function parseSession(value: Record<string, unknown>): Session {
  return {
    id: stringValue(value.id),
    projectId: stringValue(value.projectId ?? value.appId),
    name: stringValue(value.name),
    cwd: stringValue(value.cwd),
    workspaceId: nullableString(value.workspaceId),
    parentSessionId: nullableString(value.parentSessionId),
    leafEntryId: nullableString(value.leafEntryId),
    createdAt: numberValue(value.createdAt),
    updatedAt: numberValue(value.updatedAt),
    isTop: value.isTop === true,
  };
}

function parseEntry(value: unknown, filePath: string): Entry {
  if (!isRecord(value)) throw new Error(`Invalid entry in ${filePath}`);
  const type = stringValue(value.type);
  return {
    id: stringValue(value.id),
    sessionId: stringValue(value.sessionId),
    parentId: nullableString(value.parentId),
    type: type === "model_change" ? "model_change" : "message",
    timestamp: numberValue(value.timestamp),
    data: isRecord(value.data) ? clone(value.data) : {},
    tokenUsage: parseTokenUsage(value.tokenUsage),
  };
}

function serializeRecord(record: SessionRecord): string {
  return `${JSON.stringify(record)}\n`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return clone(value);
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseTokenUsage(value: unknown): TokenUsage | null {
  const parsed = parseObject(value);
  return "turn" in parsed && "latestCall" in parsed ? (parsed as unknown as TokenUsage) : null;
}
