import { z } from "zod";

import { defineAssistantBlock } from "../../../core/common/index.js";

export const PROJECTS_LIST_TOOL = "list_projects";
export const PROJECTS_LIST_BLOCK_TYPE = "projects.list";

export const ProjectsListBlockPropsSchema = z.object({});

export const PROJECTS_LIST_BLOCK = defineAssistantBlock({
  type: PROJECTS_LIST_BLOCK_TYPE,
  description: "Display the user's Traceability projects as an interactive project list.",
  propsSchema: ProjectsListBlockPropsSchema,
});

export type ProjectsListBlockProps = z.output<typeof ProjectsListBlockPropsSchema>;
