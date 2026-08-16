import "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { JSONContent } from "@tiptap/core";

import type { AssistantBlockDescriptor } from "./assistant-block";
import type { AvailableModel } from "./models-ipc";

export interface AppAssistantBlockMessage {
  block: AssistantBlockDescriptor;
  role: "assistantBlock";
  timestamp: number;
  toolCallId: string;
  toolName: string;
}

declare module "@earendil-works/pi-agent-core" {
  type AppUserMessageKind = "prompt" | "follow-up" | "steering";

  interface AppUserMessage extends UserMessage {
    kind: AppUserMessageKind;
    jsonContent: JSONContent;
    metadata?: {
      model?: Pick<AvailableModel, "modelId" | "providerId">;
      skillIds?: string[];
    };
  }

  interface CustomAgentMessages {
    AppUserMessage: AppUserMessage;
    AppAssistantBlockMessage: AppAssistantBlockMessage;
  }
}
