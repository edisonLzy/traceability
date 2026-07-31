import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { DiscoveredSkill } from "@shared/skills-ipc";
import { useCallback, useEffect, useState } from "react";

export function useAgentSkills() {
  const { invoke } = useElectronIPC();
  const [skills, setSkills] = useState<DiscoveredSkill[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextSkills = await invoke("listSkills");
      setSkills(nextSkills);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [invoke]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setEnabled = useCallback(
    async (skillId: string, enabled: boolean) => {
      await invoke("setSkillEnabled", skillId, enabled);
      setSkills((current) =>
        current.map((skill) => (skill.id === skillId ? { ...skill, enabled } : skill)),
      );
    },
    [invoke],
  );

  return { error, refresh, setEnabled, skills };
}
