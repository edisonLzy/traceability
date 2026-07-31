export interface Session {
  id: string;
  name: string;
  cwd: string;
  workspaceId: string | null;
  parentSessionId: string | null;
  leafEntryId: string | null;
  createdAt: number;
  updatedAt: number;
  isTop: boolean;
  projectId: string;
}

export type EntryType = "message" | "model_change";

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface TokenUsage {
  turn: Usage;
  latestCall: Usage;
}

export interface Entry {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: EntryType;
  timestamp: number;
  data: Record<string, unknown>;
  tokenUsage?: TokenUsage | null;
}

export interface SessionPersistenceIPC {
  createSession: (projectId: string) => Promise<Session>;
  listSessions: (projectId: string) => Promise<Session[]>;
  getSession: (sessionId: string) => Promise<Session | null>;
  getSessionEntries: (sessionId: string) => Promise<Entry[]>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  appendSessionEntries: (sessionId: string, entries: Entry[]) => Promise<void>;
  getBranch: (sessionId: string, leafId?: string) => Promise<Entry[]>;
  setLeaf: (sessionId: string, entryId: string) => Promise<void>;
  buildContext: (
    sessionId: string,
    leafId?: string,
  ) => Promise<{
    messages: Array<{ id: string; role: string; content: unknown }>;
    model: { providerId: string; modelId: string } | null;
  }>;
}
