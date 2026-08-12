import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import type { MonitoringContext } from "@shared/agent-message";
import type { AvailableModel } from "@shared/models-ipc";

/** Renderer view of the persisted session contract supplied by the main process. */
export interface Session {
  id: string;
  name: string;
  projectId: string;
  cwd?: string;
  workspaceId?: string | null;
  parentSessionId?: string | null;
  leafEntryId?: string | null;
  createdAt: number;
  updatedAt: number;
  isTop?: boolean;
}

/** Durable entry shape used by the session persistence IPC. */
export interface Entry {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: "message" | "model_change";
  timestamp: number;
  data: Record<string, unknown>;
  tokenUsage?: TokenUsage | null;
}

export interface TokenUsage {
  turn: Usage;
  latestCall: Usage;
}

export interface AgentMessageMetadata {
  model?: Pick<AvailableModel, "providerId" | "modelId">;
  skillIds?: string[];
  monitoringContext?: MonitoringContext;
}

export type { AgentMessage };
export type { MonitoringContext };
