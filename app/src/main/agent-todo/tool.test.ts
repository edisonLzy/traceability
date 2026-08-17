import { describe, expect, it } from "vitest";

import { agentTodoTool } from "./tool.js";

describe("agentTodoTool", () => {
  it("returns a complete normalized snapshot", async () => {
    const result = await agentTodoTool.execute("call-1", {
      todos: [{ id: "inspect", title: "  Inspect issue  ", status: "in_progress" }],
    });

    expect(result.details).toEqual({
      todos: [{ id: "inspect", title: "Inspect issue", status: "in_progress" }],
    });
    expect(result.content).toEqual([{ type: "text", text: "Todo list updated" }]);
  });

  it("accepts an empty list as an explicit clear", async () => {
    const result = await agentTodoTool.execute("call-2", { todos: [] });
    expect(result.details).toEqual({ todos: [] });
  });
});
