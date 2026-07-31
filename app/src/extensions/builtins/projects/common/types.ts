import type { Project } from "../../../../shared/trpc-types.js";

export const PROJECTS_LIST_TOOL = "list_projects";
export const PROJECTS_LIST_BLOCK_TYPE = "projects.list";

export interface ProjectsListBlockProps {
  projects: Project[];
}
