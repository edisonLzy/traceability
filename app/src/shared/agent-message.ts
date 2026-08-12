import "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { JSONContent } from "@tiptap/core";

import type { AvailableModel } from "./models-ipc";

/** Monitoring object pinned to an Agent conversation by the current workspace. */
export interface MonitoringContext {
  projectId: string;
  projectName?: string;
  source: "general" | "issue" | "metric" | "performance";
  issueId?: string;
  issueTitle?: string;
  metricName?: string;
  hours?: 1 | 24 | 168;
}

declare module "@earendil-works/pi-agent-core" {
  type AppUserMessageKind = "prompt" | "follow-up" | "steering";

  interface AppUserMessage extends UserMessage {
    kind: AppUserMessageKind;
    jsonContent: JSONContent;
    metadata?: {
      model?: Pick<AvailableModel, "modelId" | "providerId">;
      skillIds?: string[];
      monitoringContext?: MonitoringContext;
    };
  }

  interface CustomAgentMessages {
    AppUserMessage: AppUserMessage;
  }
}
