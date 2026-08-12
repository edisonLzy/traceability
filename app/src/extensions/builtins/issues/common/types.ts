import { z } from "zod";

import { defineAssistantBlock } from "../../../core/common/index.js";

export const ISSUES_LIST_TOOL = "list_issues";
export const ISSUES_GET_TOOL = "get_issue";
export const ISSUES_LIST_BLOCK_TYPE = "issues.list";

export const IssuesListBlockPropsSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(["all", "unresolved", "resolved", "ignored"]).default("all"),
  limit: z.number().int().min(1).max(100).default(20),
});

export const ISSUES_LIST_BLOCK = defineAssistantBlock({
  type: ISSUES_LIST_BLOCK_TYPE,
  description:
    "Display Traceability issues for a project. Omit projectId to use the currently selected project.",
  propsSchema: IssuesListBlockPropsSchema,
});

export type IssuesListBlockProps = z.output<typeof IssuesListBlockPropsSchema>;
