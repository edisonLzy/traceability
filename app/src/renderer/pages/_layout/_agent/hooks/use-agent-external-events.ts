import type { AgentPromptEvent } from "@renderer/lib/agent-events";
import { agentStore, type MonitoringContext } from "@renderer/store/agent";
import type { AvailableModel } from "@shared/models-ipc";
import { useEffect } from "react";

import { createTextDocument } from "../prompt-input/rich-text";
import type { PromptSubmission } from "../prompt-types";

interface UseAgentExternalEventsOptions {
  activeSessionId: string | null;
  activeSession?: { projectId?: string; model?: AvailableModel | null };
  submitPrompt: (submission: PromptSubmission, contextOverride?: MonitoringContext) => void;
  createSession: () => Promise<{ id: string } | null>;
  refreshSessions: () => Promise<unknown>;
  selectSession: (id: string) => Promise<unknown>;
  setPanelError: (error: string | null) => void;
}

export function useAgentExternalEvents({
  activeSessionId,
  activeSession,
  submitPrompt,
  createSession,
  refreshSessions,
  selectSession,
  setPanelError,
}: UseAgentExternalEventsOptions) {
  useEffect(() => {
    const onPrompt = (event: Event) => {
      const detail = (event as CustomEvent<AgentPromptEvent>).detail;
      if (!detail) return;
      const model =
        activeSession?.projectId === detail.context.projectId ? activeSession.model : null;
      if (!model) {
        setPanelError("No compatible model is configured.");
        return;
      }
      if (activeSessionId && activeSession?.projectId === detail.context.projectId) {
        agentStore.getState().setMonitoringContext(activeSessionId, detail.context);
      }
      void submitPrompt(
        {
          content: detail.prompt,
          jsonContent: createTextDocument(detail.prompt),
          model,
          skillIds: [],
        },
        detail.context,
      );
    };

    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<MonitoringContext>).detail;
      if (!detail || !activeSessionId) return;
      agentStore.getState().setMonitoringContext(activeSessionId, detail);
    };

    const onNew = () => void createSession();
    const onSessionUpdated = () => void refreshSessions();

    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (detail?.sessionId) void selectSession(detail.sessionId);
    };

    window.addEventListener("traceability:agent-prompt", onPrompt);
    window.addEventListener("traceability:agent-context", onContext);
    window.addEventListener("traceability:agent-new-session", onNew);
    window.addEventListener("traceability:agent-session-updated", onSessionUpdated);
    window.addEventListener("traceability:agent-select-session", onSelect);
    return () => {
      window.removeEventListener("traceability:agent-prompt", onPrompt);
      window.removeEventListener("traceability:agent-context", onContext);
      window.removeEventListener("traceability:agent-new-session", onNew);
      window.removeEventListener("traceability:agent-session-updated", onSessionUpdated);
      window.removeEventListener("traceability:agent-select-session", onSelect);
    };
  }, [
    activeSession,
    activeSessionId,
    createSession,
    refreshSessions,
    selectSession,
    setPanelError,
    submitPrompt,
  ]);
}
