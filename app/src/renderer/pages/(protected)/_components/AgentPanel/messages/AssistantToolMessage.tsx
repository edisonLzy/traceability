import type { ToolExecutionState } from "@renderer/store/agent";
import { getAssistantBlockDescriptor, RENDER_UI_TOOL_NAME } from "@shared/assistant-block";

import { AssistantBlockView } from "./AssistantBlockView";

interface AssistantToolMessageProps {
  toolState?: ToolExecutionState;
}

export function AssistantToolMessage({ toolState }: AssistantToolMessageProps) {
  if (toolState?.toolName === RENDER_UI_TOOL_NAME) return null;
  const descriptor = getAssistantBlockDescriptor(toolState?.details);
  if (!descriptor) return null;

  return <AssistantBlockView block={descriptor} />;
}
