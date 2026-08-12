interface AssistantThinkingMessageProps {
  thinking: string[];
}

export function AssistantThinkingMessage({ thinking }: AssistantThinkingMessageProps) {
  if (thinking.length === 0) return null;
  return (
    <details className="mb-2 overflow-hidden rounded-[10px] border border-hairline bg-overlay text-[10px] text-tertiary">
      <summary className="cursor-pointer px-2.5 py-2 select-none transition-colors hover:bg-overlay-strong hover:text-muted">
        Reasoning
      </summary>
      <div className="border-t border-hairline px-2.5 py-2 whitespace-pre-wrap leading-[1.6]">
        {thinking.join("\n")}
      </div>
    </details>
  );
}
