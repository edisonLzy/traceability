import { trpc } from "@renderer/lib/trpc";
import { projectStore } from "@renderer/store/project";
import { useEffect } from "react";

/**
 * 项目初始化 hook：通过 tRPC 拉取项目列表，同步到 projectStore，
 * 并在尚无有效选择时回落至第一个项目。
 * 仅在 Layout.tsx 顶层调用一次，子组件直接从 store 读取。
 */
export function useSetupProjects() {
  const { data, isLoading } = trpc.projects.list.useQuery(undefined, { staleTime: 30_000 });

  useEffect(() => {
    if (!data) return;
    projectStore.getState().setProjects(data);
    const current = projectStore.getState().currentProject;
    if (data.length > 0 && !current) {
      projectStore.getState().setCurrentProject(data[0]!);
    }
  }, [data]);

  return { projects: data ?? [], loading: isLoading };
}
