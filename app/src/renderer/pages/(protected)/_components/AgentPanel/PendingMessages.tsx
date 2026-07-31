import { agentStore } from "@renderer/store/agent";
import { useStore } from "zustand";

export function PendingMessages({ sessionId }: { sessionId: string }) {
  const messages = useStore(agentStore, (state) => state.getSessionPendingMessages(sessionId));
  if (messages.length === 0) return null;

  return (
    <section className="mb-2 flex max-h-20 items-start gap-2 overflow-hidden rounded-[7px] border border-warning/20 bg-warning/[0.055] px-2 py-1.5">
      <div className="min-w-0 flex-1 overflow-y-auto">
        {messages.map((message) => (
          <p key={message.timestamp} className="truncate text-[9px] leading-4 text-muted">
            <span className="mr-1 text-warning/80">
              {message.kind === "steering" ? "Steer" : "Follow-up"}
            </span>
            {typeof message.content === "string" ? message.content : "Rich prompt"}
          </p>
        ))}
      </div>
    </section>
  );
}
