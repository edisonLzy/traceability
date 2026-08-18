import { AGENT_BLOCK_LANGUAGE, parseAssistantBlockPayload } from "@extensions/core/common";
import { useAssistantBlock } from "@extensions/core/renderer";
import { useMemo } from "react";
import type { CustomRendererProps, PluginConfig } from "streamdown";
import { Streamdown } from "streamdown";

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
    <div className="min-w-0 max-w-full overflow-x-hidden text-[15px] leading-7 text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_code]:text-foreground [&_em]:text-foreground/80 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-inherit [&_ol]:text-inherit [&_p]:m-0 [&_p]:text-inherit [&_p+p]:mt-2 [&_pre]:mt-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-foreground [&_span]:text-inherit [&_strong]:text-foreground [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:text-inherit">
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
  // Called unconditionally so hooks rules hold (type is "" until parsed).
  const registration = useAssistantBlock(result.status === "ready" ? result.payload.type : "");

  if (result.status === "pending") {
    return (
      <div className="my-2 rounded-md border border-hairline bg-overlay px-2 py-1.5 text-[10px] text-tertiary">
        Rendering block…
      </div>
    );
  }

  if (result.status === "invalid") {
    return (
      <div className="my-2 rounded-md border border-hairline bg-overlay px-2 py-1.5 text-[10px] text-tertiary">
        Unsupported assistant block
      </div>
    );
  }

  const Block = registration?.render;
  if (!Block) {
    return (
      <div className="my-2 rounded-md border border-hairline bg-overlay px-2 py-1.5 text-[10px] text-tertiary">
        Unsupported assistant block: <span className="font-mono">{result.payload.type}</span>
      </div>
    );
  }

  return <Block props={result.payload.props} raw={result.payload.raw} />;
}
