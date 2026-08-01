import { useAssistantBlock } from "@extensions/core/renderer";
import type { ToolExecutionState } from "@renderer/store/agent";

interface AssistantToolMessageProps {
  sessionId: string;
  toolState?: ToolExecutionState;
}

export function AssistantToolMessage({ sessionId, toolState }: AssistantToolMessageProps) {
  const descriptor = getAssistantBlockDescriptor(toolState?.details);
  const registration = useAssistantBlock(descriptor?.type ?? "");
  const Block = registration?.render;

  if (!descriptor || !Block) return null;

  return <Block props={{ ...descriptor.props, sessionId }} raw={JSON.stringify(descriptor)} />;
}

interface AssistantBlockDescriptor {
  props: Record<string, unknown>;
  type: string;
}

function getAssistantBlockDescriptor(details: unknown): AssistantBlockDescriptor | null {
  if (!isRecord(details) || !isRecord(details.assistantBlock)) return null;
  const { assistantBlock } = details;
  if (typeof assistantBlock.type !== "string") return null;
  return {
    props: isRecord(assistantBlock.props) ? assistantBlock.props : {},
    type: assistantBlock.type,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
