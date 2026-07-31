import { join } from "node:path";

import { app } from "electron";
import type { BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";

import type { Session, SessionPersistenceIPC } from "../../shared/session-persistence-ipc.js";
import { AbstractAgentIPCHandler } from "../agent-ipc.js";
import { JsonlSessionStore } from "./jsonl-session-store.js";

export class SessionPersistence
  extends AbstractAgentIPCHandler<SessionPersistenceIPC>
  implements SessionPersistenceIPC
{
  private readonly store: JsonlSessionStore;

  constructor(browserWindow: BrowserWindow, sessionDirectory?: string) {
    super(browserWindow);
    const userDataDirectory = app.getPath("userData");
    this.store = new JsonlSessionStore(
      sessionDirectory ?? join(userDataDirectory, "sessions"),
      join(userDataDirectory, "traceability-agent.sqlite"),
    );
    this.unbind = this.bind();
  }

  protected override bind(): VoidFunction {
    const channels = [
      "createSession",
      "listSessions",
      "getSession",
      "getSessionEntries",
      "renameSession",
      "deleteSession",
      "appendSessionEntries",
      "getBranch",
      "setLeaf",
      "buildContext",
    ] as const;
    for (const channel of channels) {
      this.typedIpcMain.handle(
        channel,
        (this as unknown as Record<string, unknown>)[channel] as never,
      );
    }
    return () => {
      for (const channel of channels) {
        this.typedIpcMain.removeHandler(channel);
      }
    };
  }

  public createSession: SessionPersistenceIPC["createSession"] = async (projectId) => {
    const now = Date.now();
    const session: Session = {
      id: uuidv4(),
      projectId,
      name: "",
      cwd: "",
      workspaceId: null,
      parentSessionId: null,
      leafEntryId: null,
      createdAt: now,
      updatedAt: now,
      isTop: false,
    };
    return this.store.create(session);
  };

  public listSessions: SessionPersistenceIPC["listSessions"] = async (projectId) => {
    return this.store.list(projectId);
  };

  public getSession: SessionPersistenceIPC["getSession"] = async (sessionId) => {
    return this.store.get(sessionId);
  };

  public getSessionEntries: SessionPersistenceIPC["getSessionEntries"] = async (sessionId) => {
    return this.store.getEntries(sessionId);
  };

  public renameSession: SessionPersistenceIPC["renameSession"] = async (sessionId, name) => {
    this.store.rename(sessionId, name);
  };

  public deleteSession: SessionPersistenceIPC["deleteSession"] = async (sessionId) => {
    this.store.delete(sessionId);
  };

  public appendSessionEntries: SessionPersistenceIPC["appendSessionEntries"] = async (
    sessionId,
    entries,
  ) => {
    this.store.appendEntries(sessionId, entries);
  };

  public getBranch: SessionPersistenceIPC["getBranch"] = async (sessionId, leafId) => {
    return this.store.getBranch(sessionId, leafId);
  };

  public setLeaf: SessionPersistenceIPC["setLeaf"] = async (sessionId, entryId) => {
    this.store.setLeaf(sessionId, entryId);
  };

  public buildContext: SessionPersistenceIPC["buildContext"] = async (sessionId, leafId) => {
    const branch = this.store.getBranch(sessionId, leafId);
    const messages: Array<{ id: string; role: string; content: unknown }> = [];
    let model: { providerId: string; modelId: string } | null = null;

    for (const entry of branch) {
      if (entry.type === "message") {
        const data = entry.data as { role?: string; content?: unknown };
        messages.push({
          id: entry.id,
          role: data.role ?? "unknown",
          content: data.content ?? "",
        });
      } else if (entry.type === "model_change") {
        const data = entry.data as { providerId?: string; modelId?: string };
        if (data.providerId && data.modelId) {
          model = { providerId: data.providerId, modelId: data.modelId };
        }
      }
    }

    return { messages, model };
  };

  public destroyAll() {
    this.unbind?.();
    this.store.close();
  }
}
