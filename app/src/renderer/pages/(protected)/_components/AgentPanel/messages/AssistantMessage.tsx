import type { AssistantMessage as AssistantMessageType } from "@earendil-works/pi-ai";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { Separator } from "@renderer/components/ui/separator";
import { cn } from "@renderer/lib/utils";
import type { ToolExecutionState } from "@renderer/store/agent";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantResponseMessage } from "./AssistantResponseMessage";
import { AssistantThinkingMessage } from "./AssistantThinkingMessage";
import { AssistantToolMessage } from "./AssistantToolMessage";
import { CopyMessageButton } from "./toolbar/CopyMessageButton";
import { MessageToolbar } from "./toolbar/MessageToolbar";

interface AssistantMessageProps {
  completedAt?: number;
  isStreaming: boolean;
  message: AssistantMessageType;
  sessionId: string;
  startedAt: number;
  toolStates: Map<string, ToolExecutionState>;
}

export function AssistantMessage({
  completedAt,
  isStreaming,
  message,
  sessionId,
  startedAt,
  toolStates,
}: AssistantMessageProps) {
  const contentArray = Array.isArray(message.content) ? message.content : [];
  const errorMessage = message.errorMessage?.trim();
  const hasError =
    message.stopReason === "error" || message.stopReason === "aborted" || Boolean(errorMessage);

  const { processingContent, textContent } = contentArray.reduce<{
    processingContent: (ThinkingContent | ToolCall)[];
    textContent: TextContent[];
  }>(
    (acc, block) => {
      if (block.type === "thinking" || block.type === "toolCall") {
        acc.processingContent.push(block as ThinkingContent | ToolCall);
      } else if (block.type === "text") {
        acc.textContent.push(block as TextContent);
      }
      return acc;
    },
    { processingContent: [], textContent: [] },
  );

  const assistantResponseText = textContent.map((block) => block.text).join("\n");
  const [isProcessingOpen, setIsProcessingOpen] = useState(true);

  useEffect(() => {
    setIsProcessingOpen(textContent.length === 0);
  }, [textContent.length]);

  return (
    <article className="mb-5 grid min-w-0 grid-cols-[34px_minmax(0,1fr)] items-start gap-3">
      <span className="flex size-8.5 items-center justify-center rounded-sm border-2 border-ink bg-signal-cyan font-mono text-[10px] font-bold text-[#102047] shadow-[var(--hard-shadow-sm)]">
        AI
      </span>
      <div className="flex min-w-0 max-w-[95%] flex-col gap-1.5">
        {processingContent.length > 0 ? (
          <Collapsible open={isProcessingOpen} onOpenChange={(open) => setIsProcessingOpen(open)}>
            <div className="flex flex-col gap-2">
              <CollapsibleTrigger
                aria-label="Toggle reasoning and tool activity"
                className="group/trigger flex w-fit cursor-pointer items-center gap-1.5"
              >
                <ProcessingTip
                  completedAt={completedAt}
                  hasError={hasError}
                  isStreaming={isStreaming}
                  startedAt={startedAt}
                />
                <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-panel-open/trigger:rotate-90 hover:text-foreground" />
              </CollapsibleTrigger>
              <Separator className="h-0.5 bg-ink" />
            </div>

            <CollapsibleContent className="mt-2 flex flex-col gap-2">
              {processingContent.map((block, index) => {
                if (block.type === "thinking") {
                  return (
                    <AssistantThinkingMessage key={`thinking-${index}`} content={block.thinking} />
                  );
                }

                return (
                  <AssistantToolMessage
                    key={block.id}
                    args={block.arguments}
                    sessionId={sessionId}
                    toolName={block.name}
                    toolState={toolStates.get(block.id)}
                  />
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {textContent.map((block, i) => (
          <AssistantResponseMessage key={`text-${i}`} isStreaming={isStreaming} text={block.text} />
        ))}

        {hasError && textContent.every((block) => block.text.trim().length === 0) ? (
          <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm leading-6 whitespace-pre-wrap text-danger [overflow-wrap:anywhere]">
            {errorMessage ||
              "Agent request failed. Please check the model/API configuration and try again."}
          </div>
        ) : null}

        {!hasError && !isStreaming ? (
          <MessageToolbar align="start">
            <CopyMessageButton text={assistantResponseText} />
          </MessageToolbar>
        ) : null}
      </div>
    </article>
  );
}

// ─── ProcessingTip ──────────────────────────────────────────────

interface ProcessingTipProps {
  completedAt?: number;
  hasError: boolean;
  isStreaming: boolean;
  startedAt: number;
}

function ProcessingTip({ completedAt, hasError, isStreaming, startedAt }: ProcessingTipProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming) return;

    setNow(Date.now());

    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [isStreaming, startedAt]);

  const endTime = isStreaming ? now : (completedAt ?? startedAt);
  const elapsed = Math.max(0, Math.floor((endTime - startedAt) / 1000));

  return (
    <span
      className={cn(
        "text-xs font-normal text-muted-foreground",
        hasError && "text-danger",
        isStreaming && !hasError && "animate-pulse",
      )}
    >
      {`${hasError ? "处理失败" : isStreaming ? "正在处理" : "已处理"} ${elapsed}s`}
    </span>
  );
}

// ─── Local types ────────────────────────────────────────────────

interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

interface ToolCall {
  id: string;
  type: "toolCall";
  name: string;
  arguments: unknown;
}

interface TextContent {
  type: "text";
  text: string;
}
