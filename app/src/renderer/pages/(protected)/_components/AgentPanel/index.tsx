import { getAgentContext, type MonitoringContext } from "@renderer/lib/agent-events";
import { agentStore } from "@renderer/store/agent";
import { useEffect, useState } from "react";
import { useStore } from "zustand";

import { ActiveSessionContent } from "./ActiveSessionContent";
import { PendingSessionContent } from "./PendingSessionContent";

/** Routes between the pending welcome screen and the active chat UI. */
export function AgentPanel() {
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId);
  const monitoringContext = useMonitoringContextBridge(activeSessionId);

  if (activeSessionId === null) {
    return <PendingSessionContent monitoringContext={monitoringContext} />;
  }

  return <ActiveSessionContent sessionId={activeSessionId} />;
}

/** Keeps workspace selection and the currently active Agent session in sync. */
function useMonitoringContextBridge(activeSessionId: string | null): MonitoringContext | null {
  const [monitoringContext, setMonitoringContext] = useState<MonitoringContext | null>(() =>
    getAgentContext(),
  );

  useEffect(() => {
    const handleContext = (event: Event) => {
      const context = (event as CustomEvent<MonitoringContext>).detail;
      setMonitoringContext(context);
      const sessionId = agentStore.getState().activeSessionId;
      if (sessionId) agentStore.getState().setMonitoringContext(sessionId, context);
    };
    window.addEventListener("traceability:agent-context", handleContext);
    return () => window.removeEventListener("traceability:agent-context", handleContext);
  }, []);

  useEffect(() => {
    if (activeSessionId && monitoringContext) {
      agentStore.getState().setMonitoringContext(activeSessionId, monitoringContext);
    }
  }, [activeSessionId, monitoringContext]);

  return monitoringContext;
}
