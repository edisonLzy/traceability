import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";

export function convertAgentMessagesToLlmMessages(messages: AgentMessage[]): Message[] {
  return messages.flatMap((message): Message[] => {
    if (message.role === "user") {
      return [
        {
          role: "user",
          content: message.content,
          timestamp: message.timestamp,
        },
      ];
    }

    if (message.role === "assistant" || message.role === "toolResult") {
      return [message];
    }

    return [];
  });
}
