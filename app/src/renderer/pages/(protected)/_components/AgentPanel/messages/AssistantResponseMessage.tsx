import { AGENT_BLOCK_LANGUAGE, parseAssistantBlockPayload } from "@extensions/core/common";
import { useMemo } from "react";
import type { CustomRendererProps, PluginConfig } from "streamdown";
import { Streamdown } from "streamdown";

import { AssistantBlockFailure, AssistantBlockView } from "./AssistantBlockView";

interface AssistantResponseMessageProps {
  text: string;
  isStreaming: boolean;
}

export function AssistantResponseMessage({ text, isStreaming }: AssistantResponseMessageProps) {
  const plugins = useMemo<PluginConfig>(
    () => ({
      renderers: [{ component: AgentBlockRenderer, language: AGENT_BLOCK_LANGUAGE }],
    }),
    [],
  );

  if (!text) return null;

  return (
    <div className="text-[12px] leading-[1.62] text-muted [&_p]:m-0 [&_p+p]:mt-2 [&_pre]:mt-2 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:text-[10px]">
      <Streamdown isAnimating={isStreaming} plugins={plugins}>
        {text}
      </Streamdown>
    </div>
  );
}

/**
 * Streamdown custom renderer for `agent-block` fenced code blocks. The agent
 * emits a fence whose body is JSON `{ type, props }`; we parse it and mount the
 * assistant block registered for `type`, falling back to a placeholder while
 * streaming or when the block is unknown/malformed. Mirrors Divisor's
 * `PluginBlockRenderer`.
 */
function AgentBlockRenderer({ code, isIncomplete }: CustomRendererProps) {
  const result = parseAssistantBlockPayload(code, isIncomplete);

  if (result.status === "pending") {
    return (
      <div className="my-2 rounded-md border border-hairline bg-overlay px-2 py-1.5 text-[10px] text-tertiary">
        Rendering block…
      </div>
    );
  }

  if (result.status === "invalid") {
    return (
      <AssistantBlockFailure
        block={{ type: "invalid agent-block", props: result.raw }}
        reasons={["The agent-block payload is not valid JSON with a string type."]}
      />
    );
  }

  return <AssistantBlockView block={result.payload} raw={result.payload.raw} />;
}
