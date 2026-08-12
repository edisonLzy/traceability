import type { AppAssistantBlockMessage as AppAssistantBlockMessageType } from "@shared/agent-message";

import { AssistantBlockView } from "./AssistantBlockView";

export function AssistantBlockMessage({ message }: { message: AppAssistantBlockMessageType }) {
  return (
    <article className="mb-5 min-w-0 max-w-full overflow-hidden pr-2">
      <AssistantBlockView block={message.block} />
    </article>
  );
}
