import { agentStore } from "@renderer/store/agent";
import { useStore } from "zustand";

import { ActiveSessionContent } from "./ActiveSessionContent";
import { PendingSessionContent } from "./PendingSessionContent";

/** Routes between the pending welcome screen and the active chat UI. */
export function AgentPanel() {
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId);

  if (activeSessionId === null) {
    return <PendingSessionContent />;
  }

  return <ActiveSessionContent sessionId={activeSessionId} />;
}
