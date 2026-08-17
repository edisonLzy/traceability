interface AssistantThinkingMessageProps {
  content: string;
}

export function AssistantThinkingMessage({ content }: AssistantThinkingMessageProps) {
  if (!content) return null;

  return (
    <pre className="m-0 max-w-full overflow-x-auto font-sans text-[13px] leading-6 whitespace-pre-wrap break-words text-muted-foreground">
      {content}
    </pre>
  );
}
