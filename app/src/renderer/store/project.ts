import type { Project } from "@shared/trpc-types";
import { createStore } from "zustand/vanilla";

const STORAGE_KEY = "traceability:current-project";

export interface ProjectStoreState {
  /** 当前选中的项目 id，localStorage 持久化。 */
  projectId: string;
  /** server 项目列表（react-query 数据同步到 store）。 */
  projects: Project[];
  setProjectId: (projectId: string) => void;
  /** 同步项目列表；由 useCurrentProject 的查询 onSuccess 调用。 */
  setProjects: (projects: Project[]) => void;
}

export const projectStore = createStore<ProjectStoreState>()((set) => ({
  projectId: localStorage.getItem(STORAGE_KEY) ?? "",
  projects: [],
  setProjectId: (projectId) => {
    localStorage.setItem(STORAGE_KEY, projectId);
    set({ projectId });
  },
  setProjects: (projects) => set({ projects }),
}));
