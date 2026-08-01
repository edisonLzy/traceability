interface AssistantThinkingMessageProps {
  thinking: string[];
}

export function AssistantThinkingMessage({ thinking }: AssistantThinkingMessageProps) {
  if (thinking.length === 0) return null;
  return (
    <details className="mb-2 border-y border-hairline text-[10px] text-tertiary">
      <summary className="cursor-pointer select-none py-2 transition-colors hover:text-muted">
        Reasoning
      </summary>
      <div className="border-t border-hairline py-2 whitespace-pre-wrap leading-[1.6]">
        {thinking.join("\n")}
      </div>
    </details>
  );
}
