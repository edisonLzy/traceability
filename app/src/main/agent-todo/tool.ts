import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import {
  AGENT_TODO_STATUSES,
  AGENT_TODO_TOOL_NAME,
  normalizeAgentTodoSnapshot,
  type AgentTodoSnapshot,
} from "../../shared/agent-todo.js";
import type { AppTool } from "../tools/types.js";

const AgentTodoParams = Type.Object({
  todos: Type.Array(
    Type.Object({
      id: Type.String({ description: "Stable identifier for this todo item" }),
      title: Type.String({ description: "Short actionable description" }),
      status: Type.Union(
        [
          Type.Literal(AGENT_TODO_STATUSES[0]),
          Type.Literal(AGENT_TODO_STATUSES[1]),
          Type.Literal(AGENT_TODO_STATUSES[2]),
        ],
        { description: "Current execution state of the todo item" },
      ),
    }),
    { description: "Complete replacement list for the current task" },
  ),
});

export const agentTodoTool: AppTool<typeof AgentTodoParams> = {
  name: AGENT_TODO_TOOL_NAME,
  label: "Update Todo",
  description:
    "Replace the current task Todo list with a complete snapshot. Use this for complex tasks, " +
    "keep stable ids, and submit an empty list when the Todo state should be cleared.",
  riskLevel: "safe",
  executionMode: "sequential",
  parameters: AgentTodoParams,
  async execute(_toolCallId, params) {
    const snapshot = normalizeAgentTodoSnapshot(params as Static<typeof AgentTodoParams>);
    return {
      content: [{ type: "text", text: "Todo list updated" }],
      details: snapshot satisfies AgentTodoSnapshot,
    };
  },
};
