import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "../../shared/ask-user-question-ipc.js";
import type { AppTool } from "./types.js";

const AskUserQuestionOptionSchema = Type.Object({
  label: Type.String({ description: "Option label shown to the user." }),
  description: Type.String({
    description: "Detailed description explaining what this option implies.",
  }),
});

const AskUserQuestionItemSchema = Type.Object({
  header: Type.String({
    description:
      "Short category or topic header for the question (e.g. 'Project', 'Target Scope').",
  }),
  question: Type.String({
    description: "The full question text to ask the user.",
  }),
  options: Type.Array(AskUserQuestionOptionSchema, {
    description: "List of options for the user to choose from.",
  }),
  multiSelect: Type.Optional(
    Type.Boolean({
      description: "Set to true to allow selecting multiple options.",
    }),
  ),
});

const AskUserQuestionParams = Type.Object({
  questions: Type.Array(AskUserQuestionItemSchema, {
    description: "One or more questions to ask the user interactively.",
  }),
});

export const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";

export function createAskUserQuestionTool(
  askUserQuestionFn: (input: AskUserQuestionInput) => Promise<AskUserQuestionResult>,
): AppTool<typeof AskUserQuestionParams> {
  return {
    name: ASK_USER_QUESTION_TOOL_NAME,
    label: "Ask User Question",
    description:
      "Ask the user one or more multiple-choice questions with structured options to clarify requirements, " +
      "solicit design feedback, confirm actions, or pick options. The execution blocks until the user responds in the UI.",
    riskLevel: "safe",
    executionMode: "sequential",
    parameters: AskUserQuestionParams,
    async execute(_toolCallId, params) {
      const input = params as Static<typeof AskUserQuestionParams>;
      try {
        const result = await askUserQuestionFn(input);

        const answerLines = result.answers.map((ans) => {
          const parts = [`Question: "${ans.question}"`];
          if (ans.selectedOptions && ans.selectedOptions.length > 0) {
            parts.push(`Selected: ${ans.selectedOptions.join(", ")}`);
          }
          if (ans.customAnswer) {
            parts.push(`Custom answer: "${ans.customAnswer}"`);
          }
          return parts.join(" | ");
        });

        if (result.additionalNote) {
          answerLines.push(`Additional note: ${result.additionalNote}`);
        }

        return {
          content: [
            {
              type: "text",
              text: answerLines.join("\n"),
            },
          ],
          details: result,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `AskUserQuestion was cancelled or failed: ${message}`,
            },
          ],
          details: { error: message },
        };
      }
    },
  };
}
