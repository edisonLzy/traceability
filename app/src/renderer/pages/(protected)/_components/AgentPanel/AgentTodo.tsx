import { agentStore } from "@renderer/store/agent";
import { Check, ChevronDown, Circle, ListTodo, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";

/** Read-only projection of the model-maintained Todo list. */
export function AgentTodo({ sessionId }: { sessionId: string }) {
  const [expanded, setExpanded] = useState(true);
  const state = useStore(agentStore, (store) => store.getAgentTodo(sessionId));
  const completedCount = state.todos.filter((todo) => todo.status === "completed").length;

  if (state.todos.length === 0) return null;

  return (
    <section className="mb-2 overflow-hidden rounded-[10px] border border-hairline bg-surface-glass/60 shadow-glass-sm">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-overlay"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <ListTodo className="shrink-0 text-primary-hover" size={14} />
        <span className="min-w-0 flex-1 text-[11px] font-[620] text-ink">Todo</span>
        <span className="text-[10px] text-tertiary">
          {completedCount}/{state.todos.length}
        </span>
        <ChevronDown
          className={`shrink-0 text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          size={13}
        />
      </button>

      {expanded ? (
        <ul className="border-t border-hairline px-2.5 py-1.5">
          {state.todos.map((todo) => (
            <li className="flex items-start gap-2 py-1.5" key={todo.id}>
              <TodoStatusIcon status={todo.status} />
              <span
                className={`min-w-0 flex-1 text-[10px] leading-4 ${
                  todo.status === "completed" ? "text-tertiary line-through" : "text-muted"
                }`}
              >
                {todo.title}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TodoStatusIcon({ status }: { status: "pending" | "in_progress" | "completed" }) {
  if (status === "completed") {
    return <Check className="mt-0.5 shrink-0 text-success" size={13} />;
  }
  if (status === "in_progress") {
    return <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-primary-hover" size={13} />;
  }
  return <Circle className="mt-0.5 shrink-0 text-tertiary" size={13} />;
}
