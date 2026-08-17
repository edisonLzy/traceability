export const AGENT_TODO_TOOL_NAME = "agent_todo" as const;

export const AGENT_TODO_STATUSES = ["pending", "in_progress", "completed"] as const;

export type AgentTodoStatus = (typeof AGENT_TODO_STATUSES)[number];

export interface AgentTodoItem {
  id: string;
  title: string;
  status: AgentTodoStatus;
}

export interface AgentTodoSnapshot {
  todos: AgentTodoItem[];
}

const MAX_TODO_ITEMS = 30;

/**
 * Runtime validation for structured details returned by the agent_todo tool.
 * Tool details are persisted as unknown JSON, so the renderer must not trust
 * the shape just because it came from the main process.
 */
export function isAgentTodoSnapshot(value: unknown): value is AgentTodoSnapshot {
  return parseAgentTodoDetails(value) !== null;
}

export function parseAgentTodoDetails(value: unknown): AgentTodoSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.todos) || value.todos.length > MAX_TODO_ITEMS) {
    return null;
  }

  const todos: AgentTodoItem[] = [];
  const ids = new Set<string>();
  let inProgressCount = 0;

  for (const candidate of value.todos) {
    if (!isRecord(candidate)) return null;

    const id = normalizeText(candidate.id);
    const title = normalizeText(candidate.title);
    const status = candidate.status;

    if (!id || !title || !isAgentTodoStatus(status) || ids.has(id)) return null;
    if (status === "in_progress") inProgressCount += 1;
    if (inProgressCount > 1) return null;

    ids.add(id);
    todos.push({ id, title, status });
  }

  return { todos };
}

export function normalizeAgentTodoSnapshot(snapshot: AgentTodoSnapshot): AgentTodoSnapshot {
  const parsed = parseAgentTodoDetails(snapshot);
  if (!parsed) {
    throw new Error("Invalid AgentTodo snapshot");
  }
  return parsed;
}

function isAgentTodoStatus(value: unknown): value is AgentTodoStatus {
  return typeof value === "string" && AGENT_TODO_STATUSES.includes(value as AgentTodoStatus);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
