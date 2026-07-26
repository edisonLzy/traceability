import type { Issue } from "../../../../shared/trpc-types.js";

export const ISSUES_LIST_TOOL = "list_issues";
export const ISSUES_GET_TOOL = "get_issue";
export const ISSUES_LIST_BLOCK_TYPE = "issues.list";

export interface IssuesListBlockProps {
  issues: Issue[];
  projectId: string;
  nextCursor: string | null;
}
