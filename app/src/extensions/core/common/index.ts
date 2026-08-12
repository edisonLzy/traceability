import type { AssistantBlockDescriptor } from "../../../shared/assistant-block";

export {
  defineAssistantBlock,
  GENERATIVE_UI_DETAILS_TYPE,
  getAssistantBlockDescriptor,
  RENDER_UI_TOOL_NAME,
} from "../../../shared/assistant-block";
export type {
  AssistantBlockDefinition,
  AssistantBlockDescriptor,
} from "../../../shared/assistant-block";
export * from "./ipc/index";
export type {
  AskUserQuestion,
  AskUserQuestionAnswer,
  AskUserQuestionInput,
  AskUserQuestionOption,
  AskUserQuestionResult,
} from "./human-in-the-loop";

export const AGENT_BLOCK_LANGUAGE = "agent-block";

export interface AssistantBlockPayload extends AssistantBlockDescriptor {
  raw: string;
}

export type AssistantBlockPayloadParseResult =
  | { payload: AssistantBlockPayload; status: "ready" }
  | { raw: string; status: "invalid" }
  | { raw: string; status: "pending" };

export interface FormatAssistantBlockFenceOptions {
  props?: unknown;
  type: string;
}

export function formatAssistantBlockFence({
  props = {},
  type,
}: FormatAssistantBlockFenceOptions): string {
  return `\`\`\`${AGENT_BLOCK_LANGUAGE}
${JSON.stringify({ type, props })}
\`\`\``;
}

export function parseAssistantBlockPayload(
  raw: string,
  isIncomplete: boolean,
): AssistantBlockPayloadParseResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return isIncomplete ? { raw, status: "pending" } : { raw, status: "invalid" };
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      props?: unknown;
      type?: unknown;
    };

    if (typeof parsed.type !== "string") {
      return { raw: trimmed, status: "invalid" };
    }

    return {
      payload: {
        props: "props" in parsed ? parsed.props : {},
        raw: trimmed,
        type: parsed.type,
      },
      status: "ready",
    };
  } catch {
    return isIncomplete ? { raw, status: "pending" } : { raw: trimmed, status: "invalid" };
  }
}
