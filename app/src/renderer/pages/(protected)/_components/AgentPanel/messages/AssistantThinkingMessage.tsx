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
      <pre className="m-0 border-t border-hairline px-2.5 py-2 font-sans leading-[1.6] whitespace-pre-wrap break-words">
        {thinking.join("\n")}
      </pre>
    </details>
  );
}
