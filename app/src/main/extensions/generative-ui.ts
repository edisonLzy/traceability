import { Type } from "@earendil-works/pi-ai";
import { z } from "zod";

import type { AssistantBlockDefinition } from "../../shared/assistant-block.js";
import { GENERATIVE_UI_DETAILS_TYPE, RENDER_UI_TOOL_NAME } from "../../shared/assistant-block.js";
import type { AppTool } from "../tools/index.js";

const RenderUiParameters = Type.Object({
  type: Type.String({ description: "Registered assistant-block component type." }),
  props: Type.Unknown({ description: "JSON props matching the component's catalog schema." }),
});

export function createRenderUiTool(): AppTool<typeof RenderUiParameters> {
  return {
    name: RENDER_UI_TOOL_NAME,
    label: "Render UI",
    description:
      "Render a registered UI component as the final response. Call this tool alone after all reasoning and data-tool calls are complete.",
    executionMode: "sequential",
    parameters: RenderUiParameters,
    async execute(_toolCallId, args) {
      return {
        content: [{ type: "text", text: `Rendered UI component "${args.type}".` }],
        details: {
          type: GENERATIVE_UI_DETAILS_TYPE,
          assistantBlock: { type: args.type, props: args.props },
        },
        terminate: true,
      };
    },
  };
}

export function shouldAddRenderUiTool(
  toolNames: Iterable<string>,
  definitions: AssistantBlockDefinition[],
  excludedToolNames: ReadonlySet<string>,
): boolean {
  return !(
    definitions.length === 0 ||
    excludedToolNames.has(RENDER_UI_TOOL_NAME) ||
    [...toolNames].includes(RENDER_UI_TOOL_NAME)
  );
}

export function buildGenerativeUiSystemPrompt(definitions: AssistantBlockDefinition[]): string {
  if (definitions.length === 0) return "";

  const catalog = definitions
    .map((definition) => {
      const schema = z.toJSONSchema(definition.propsSchema);
      return [
        `- ${definition.type}: ${definition.description}`,
        `  Props JSON Schema: ${JSON.stringify(schema)}`,
      ].join("\n");
    })
    .join("\n");

  return [
    "Generative UI is available through the render_ui tool.",
    "When an interactive registered component is the best final response, finish all reasoning and data-tool calls first, then call render_ui alone as the final action.",
    "Do not emit an agent-block code fence after calling render_ui. The tool result itself renders and ends the response.",
    "Registered components:",
    catalog,
  ].join("\n");
}
