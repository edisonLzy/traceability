import { useProjects } from "@renderer/hooks/use-projects";
import type { Project } from "@renderer/lib/trpc-types";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "traceability:current-project";

interface CurrentProjectValue {
  projects: Project[];
  currentProject: Project | null;
  projectId: string;
  setProjectId: (projectId: string) => void;
  loading: boolean;
}

const CurrentProjectContext = createContext<CurrentProjectValue | null>(null);

export function CurrentProjectProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useProjects();
  const projects = data ?? [];
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");

  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem(STORAGE_KEY, projectId);
  }, [projectId]);

  useEffect(() => {
    if (projects.length === 0) return;
    if (!projectId || !projects.some((project) => project.id === projectId)) {
      setProjectId(projects[0]!.id);
    }
  }, [projects, projectId]);

  const value = useMemo<CurrentProjectValue>(() => {
    const currentProject = projects.find((project) => project.id === projectId) ?? null;
    return { projects, currentProject, projectId, setProjectId, loading: isLoading };
  }, [projects, projectId, isLoading]);

  return <CurrentProjectContext.Provider value={value}>{children}</CurrentProjectContext.Provider>;
}

export function useCurrentProject(): CurrentProjectValue {
  const ctx = useContext(CurrentProjectContext);
  if (!ctx) throw new Error("useCurrentProject must be used inside <CurrentProjectProvider>");
  return ctx;
}
