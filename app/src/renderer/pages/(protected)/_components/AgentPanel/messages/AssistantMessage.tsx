import type { AssistantMessage as AssistantMessageType } from "@earendil-works/pi-ai";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@renderer/components/ui/collapsible";
import { cn } from "@renderer/lib/utils";
import type { ToolExecutionState } from "@renderer/store/agent";
import { ChevronRightIcon, Sparkles } from "lucide-react";
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
    <article className="mb-5 pr-2">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-[620] text-tertiary">
        <Sparkles
          className={isStreaming ? "animate-pulse text-primary-hover" : "text-primary-hover"}
          size={13}
        />
        Traceability Agent
        <ProcessingTip
          completedAt={completedAt}
          hasError={hasError}
          isStreaming={isStreaming}
          startedAt={startedAt}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {processingContent.length > 0 ? (
          <Collapsible open={isProcessingOpen} onOpenChange={(open) => setIsProcessingOpen(open)}>
            <CollapsibleTrigger className="group/trigger flex cursor-pointer items-center gap-1.5 py-1 text-[10px] text-tertiary transition-colors hover:text-muted">
              Reasoning & activity
              <ChevronRightIcon className="size-3 text-tertiary transition-transform group-data-panel-open/trigger:rotate-90" />
            </CollapsibleTrigger>

            <CollapsibleContent className="flex flex-col gap-2">
              {processingContent.map((block, index) => {
                if (block.type === "thinking") {
                  return (
                    <AssistantThinkingMessage
                      key={`thinking-${index}`}
                      thinking={[block.thinking]}
                    />
                  );
                }

                if (block.type === "toolCall") {
                  return (
                    <AssistantToolMessage
                      key={block.id}
                      sessionId={sessionId}
                      toolState={toolStates.get(block.id)}
                    />
                  );
                }

                return null;
              })}
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {textContent.map((block, i) => (
          <AssistantResponseMessage key={`text-${i}`} isStreaming={isStreaming} text={block.text} />
        ))}

        {hasError && textContent.every((block) => block.text.trim().length === 0) ? (
          <div className="border-l-2 border-danger/70 bg-danger/[0.06] px-2 py-1.5 text-[10px] leading-5 text-danger">
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
        "font-normal text-tertiary",
        hasError && "text-danger",
        isStreaming && !hasError && "animate-pulse text-primary-hover",
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
  arguments: string;
}

interface TextContent {
  type: "text";
  text: string;
}
