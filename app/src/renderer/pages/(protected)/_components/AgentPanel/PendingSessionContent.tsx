import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { agentStore } from "@renderer/store/agent";
import type { Session } from "@renderer/store/agent";
import { Sparkles } from "lucide-react";
import { useState } from "react";

import { PanelBody, PanelFooter, PanelHeader, PanelLayout } from "./PanelLayout";
import { PromptInput } from "./prompt-input";
import type { PromptSubmission } from "./promptTypes";
import { createSessionTitleFromPrompt } from "./sessionTitle";

/** Shown when there is no active session. Creates a session on first prompt submission. */
export function PendingSessionContent() {
  const { invoke } = useElectronIPC();
  const [isLoading, setIsLoading] = useState(false);

  const submitPrompt = async (submission: PromptSubmission) => {
    if (isLoading) return;
    setIsLoading(true);

    let session: Session | null = null;
    try {
      session = await invoke("createSession", "traceability");
      agentStore.getState().appendSession(session);
      agentStore.getState().clearAgentTodo(session.id);

      // Auto-rename: derive title from first prompt
      const title = createSessionTitleFromPrompt(submission.content);
      if (title) {
        agentStore.getState().setSessionName(session.id, title);
        try {
          await invoke("renameSession", session.id, title);
        } catch {
          // Non-critical — ignore rename failures
        }
      }

      // Register the session with the main process
      await invoke("setSessionId", session.id);
      await invoke("setSessionScope", session.id, "main");

      // Set active session — this triggers React to swap to ActiveSessionContent
      agentStore.getState().setActiveSessionId(session.id);

      // Begin the agent run
      agentStore.getState().setSessionStatus(session.id, "running");
      agentStore.getState().setModel(session.id, submission.model);

      const appUserMessage: AppUserMessage = {
        role: "user",
        content: submission.content,
        timestamp: Date.now(),
        kind: "prompt",
        jsonContent: submission.jsonContent,
        metadata: {
          model: {
            modelId: submission.model.modelId,
            providerId: submission.model.providerId,
          },
          skillIds: submission.skillIds,
        },
      };

      await invoke("prompt", session.id, appUserMessage);
    } catch (error) {
      console.error("Failed to create session and submit prompt", error);
      if (session?.id) {
        agentStore.getState().setSessionStatus(session.id, "idle");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PanelLayout>
      <PanelHeader subtitle="Traceability Agent" title="New conversation" />
      <PanelBody className="flex items-center justify-center">
        <div className="glass-control mx-auto max-w-[300px] rounded-[18px] px-8 py-7 text-center">
          <span className="mx-auto mb-3 grid size-10 place-items-center rounded-[12px] border border-primary/20 bg-primary/10 text-primary-hover shadow-glow">
            <Sparkles size={17} />
          </span>
          <h2 className="text-[13px] font-[620] leading-snug text-ink">Investigate this project</h2>
          <p className="mt-1.5 text-[10px] leading-5 text-tertiary">
            Ask about the current issue, performance view, or session replay.
          </p>
        </div>
      </PanelBody>
      <PanelFooter>
        <div className="mx-auto w-full max-w-[960px]">
          <PromptInput
            disabled={isLoading}
            initialModel={null}
            isRunning={false}
            onSubmit={submitPrompt}
          />
        </div>
      </PanelFooter>
    </PanelLayout>
  );
}
