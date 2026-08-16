import type { ZodType } from "zod";

export const RENDER_UI_TOOL_NAME = "render_ui";
export const GENERATIVE_UI_DETAILS_TYPE = "generative-ui.render";

export interface AssistantBlockDescriptor {
  props: unknown;
  type: string;
}

export interface AssistantBlockDefinition<TSchema extends ZodType = ZodType> {
  description: string;
  propsSchema: TSchema;
  type: string;
}

export function defineAssistantBlock<TSchema extends ZodType>(
  definition: AssistantBlockDefinition<TSchema>,
): AssistantBlockDefinition<TSchema> {
  return definition;
}

export function getAssistantBlockDescriptor(details: unknown): AssistantBlockDescriptor | null {
  if (!isRecord(details) || !isRecord(details.assistantBlock)) return null;
  const { assistantBlock } = details;
  if (typeof assistantBlock.type !== "string") return null;
  return {
    props: "props" in assistantBlock ? assistantBlock.props : {},
    type: assistantBlock.type,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
