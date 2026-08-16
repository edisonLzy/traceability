import type { MessageEntry, SessionEntry } from "@renderer/store/agent";
import type { ToolExecutionState } from "@renderer/store/agent";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { AssistantBlockMessage } from "./AssistantBlockMessage";
import { AssistantMessage } from "./AssistantMessage";
import { isAssistantBlockMessage, isAssistantMessage, isUserMessage } from "./types";
import { StickyUserMessage, UserMessage, useStickyUserMessage } from "./UserMessage";

interface ChatMessagesProps {
  entries: SessionEntry[];
  isRunning: boolean;
  messageEntries: MessageEntry[];
  sessionId: string;
  streamingEntryId?: string;
  toolStates: Map<string, ToolExecutionState>;
}

export function ChatMessages({
  entries,
  isRunning,
  messageEntries,
  sessionId,
  streamingEntryId,
  toolStates,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: messageEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 6,
    gap: 18,
  });

  const { activeStickyMessage, handleStickyJump, handleStickyScroll } = useStickyUserMessage({
    messageEntries: messageEntries,
    scrollRef,
    sessionId,
    virtualizer,
  });

  useEffect(() => {
    if (messageEntries.length === 0) {
      return;
    }

    virtualizer.scrollToIndex(messageEntries.length - 1, {
      align: "end",
    });
  }, [messageEntries.length, virtualizer]);

  if (messageEntries.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-[280px]">
          <span className="glass-control mx-auto mb-3 grid size-10 place-items-center rounded-[12px] bg-primary/10 text-primary-hover shadow-glow">
            <Sparkles size={17} />
          </span>
          <strong className="block text-[13px] font-[620] text-ink">
            Investigate this project
          </strong>
          <p className="mt-1.5 text-[10px] leading-5 text-tertiary">
            Ask about the current issue, performance view, or session replay.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-w-0 overflow-x-hidden bg-surface-1/20">
      <div
        ref={scrollRef}
        className="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-4"
        onScroll={handleStickyScroll}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = messageEntries[virtualRow.index];
            if (!entry) return null;

            const message = entry.data;
            if (!("role" in message)) return null;

            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full min-w-0"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="mx-auto w-full max-w-[720px] min-w-0">
                  {isUserMessage(message) ? (
                    <UserMessage
                      message={message}
                      entryId={entry.id}
                      sessionId={sessionId}
                      isRunning={isRunning}
                      entries={entries}
                    />
                  ) : isAssistantMessage(message) ? (
                    <AssistantMessage
                      completedAt={entry.completedAt}
                      isStreaming={entry.id === streamingEntryId}
                      message={message}
                      startedAt={entry.timestamp}
                      toolStates={toolStates}
                    />
                  ) : isAssistantBlockMessage(message) ? (
                    <AssistantBlockMessage message={message} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {activeStickyMessage ? (
        <StickyUserMessage message={activeStickyMessage} onJump={handleStickyJump} />
      ) : null}
    </div>
  );
}
