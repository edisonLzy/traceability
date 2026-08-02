import type { Project } from "@shared/trpc-types";
import { persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

export interface ProjectStoreState {
  /** 当前选中的项目（由 persist middleware 持久化到 localStorage）。 */
  currentProject: Project | null;
  /** server 项目列表（仅内存，不持久化）。 */
  projects: Project[];
  setCurrentProject: (project: Project) => void;
  /** 同步项目列表；由 useSetupProjects 的查询 useEffect 调用。 */
  setProjects: (projects: Project[]) => void;
}

export const projectStore = createStore(
  persist<ProjectStoreState>(
    (set) => ({
      currentProject: null,
      projects: [],
      setCurrentProject: (currentProject) => set({ currentProject }),
      setProjects: (projects) =>
        set((state) => ({
          projects,
          currentProject:
            state.currentProject && projects.some((p) => p.id === state.currentProject!.id)
              ? projects.find((p) => p.id === state.currentProject!.id)!
              : state.currentProject,
        })),
    }),
    { name: "traceability:current-project" },
  ),
);
