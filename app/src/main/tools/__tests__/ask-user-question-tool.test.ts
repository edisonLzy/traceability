import { describe, expect, it, vi } from "vitest";

import {
  ASK_USER_QUESTION_TOOL_NAME,
  createAskUserQuestionTool,
} from "../ask-user-question-tool.js";

describe("createAskUserQuestionTool", () => {
  it("has correct tool name and safe riskLevel", () => {
    const tool = createAskUserQuestionTool(vi.fn());
    expect(tool.name).toBe(ASK_USER_QUESTION_TOOL_NAME);
    expect(tool.riskLevel).toBe("safe");
  });

  it("calls askUserQuestion callback and formats answers into text", async () => {
    const mockAskUserQuestion = vi.fn().mockResolvedValue({
      answers: [
        {
          question: "Which reproduction video should be linked?",
          selectedOptions: ["YouTube reproduction"],
          customAnswer: undefined,
        },
      ],
      additionalNote: "User prefers video evidence",
    });

    const tool = createAskUserQuestionTool(mockAskUserQuestion);
    const result = await tool.execute("call-1", {
      questions: [
        {
          header: "Video Evidence",
          question: "Which reproduction video should be linked?",
          options: [
            { label: "YouTube reproduction", description: "YouTube link" },
            { label: "Bilibili reproduction", description: "Bilibili link" },
          ],
        },
      ],
    });

    expect(mockAskUserQuestion).toHaveBeenCalledTimes(1);
    const firstContent = result.content[0] as { type: "text"; text: string };
    expect(firstContent?.text).toContain('Question: "Which reproduction video should be linked?"');
    expect(firstContent?.text).toContain("Selected: YouTube reproduction");
    expect(firstContent?.text).toContain("Additional note: User prefers video evidence");
  });

  it("handles cancelled askUserQuestion gracefully", async () => {
    const mockAskUserQuestion = vi.fn().mockRejectedValue(new Error("User cancelled"));
    const tool = createAskUserQuestionTool(mockAskUserQuestion);

    const result = await tool.execute("call-2", {
      questions: [
        {
          header: "Confirm",
          question: "Proceed with deletion?",
          options: [{ label: "Yes", description: "Proceed" }],
        },
      ],
    });

    const firstContent = result.content[0] as { type: "text"; text: string };
    expect(firstContent?.text).toContain("AskUserQuestion was cancelled or failed");
  });
});
