import type { SystemPromptBuilder } from "../prompt/index.js";

export const AGENT_TODO_SYSTEM_PROMPT = `
## AgentTodo

The agent_todo tool maintains the visible checklist for the current user task.

- Use it for complex tasks that have multiple meaningful steps; do not use it for simple requests.
- Every call replaces the complete list. Always send all current items, not a partial patch.
- Keep item ids stable across updates and use concise, actionable titles.
- Use only pending, in_progress, and completed statuses, with at most one in_progress item.
- Mark an item completed only after the work has actually been verified.
- Revise the list when the plan changes. Send an empty list only when the current task no longer needs a checklist or the task is explicitly complete.
`.trim();

export const agentTodoPromptBuilder: SystemPromptBuilder = {
  buildSystemPrompt(raw) {
    return `${raw}\n\n${AGENT_TODO_SYSTEM_PROMPT}`;
  },
};
