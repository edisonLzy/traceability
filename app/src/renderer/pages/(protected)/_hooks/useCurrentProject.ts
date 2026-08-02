import { trpc } from "@renderer/lib/trpc";
import { projectStore } from "@renderer/store/project";
import { useEffect } from "react";
import { useStore } from "zustand";

/**
 * 获取项目列表，并在数据就绪后初始化/校准当前 project 选择。
 * server 数据由 react-query 获取并同步到 projectStore；当前选择由 store 维护（localStorage 持久化）。
 * 初始化为幂等操作：已在有效选择上时不会重复写入。
 */
export function useCurrentProject() {
  const { data, isLoading } = trpc.projects.list.useQuery(undefined, { staleTime: 30_000 });

  useEffect(() => {
    if (!data) return;
    projectStore.getState().setProjects(data);
    const current = projectStore.getState().projectId;
    if (data.length > 0 && (!current || !data.some((project) => project.id === current))) {
      projectStore.getState().setProjectId(data[0]!.id);
    }
  }, [data]);

  const { projects, projectId } = useStore(projectStore, (s) => ({
    projects: s.projects,
    projectId: s.projectId,
  }));
  const currentProject = projects.find((project) => project.id === projectId) ?? null;

  return {
    projects,
    currentProject,
    projectId,
    setProjectId: projectStore.getState().setProjectId,
    loading: isLoading,
  };
}
