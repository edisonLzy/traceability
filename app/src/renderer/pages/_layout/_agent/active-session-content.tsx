import type { AgentMessage, AppUserMessage } from "@earendil-works/pi-agent-core";
import { useRegisterCommands } from "@renderer/commands";
import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { openCommandPalette } from "@renderer/lib/agent-events";
import { agentStore, EntryStatus, type AgentSession, type Session } from "@renderer/store/agent";
import { Check, MessageCircle, MessagesSquare, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "zustand";

import { PanelBody, PanelFooter, PanelHeader, PanelLayout } from "./components/panel-layout";
import { useAgentMessages } from "./hooks/use-agent-messages";
import { useAgentTokenUsage } from "./hooks/use-agent-token-usage";
import { AskUserQuestionPanel } from "./human-in-the-loop";
import { ChatMessages } from "./messages";
import { getSelectedModel, isMessageEntry, isUserMessage, toSessionEntry } from "./messages/types";
import { PendingMessages } from "./pending-messages";
import { PromptInput, type PromptInputProps } from "./prompt-input";
import type { PromptSubmission } from "./prompt-types";
import { createSessionTitleFromPrompt, shouldAutoRenameSession } from "./session-title";

/** Full chat UI for an active session. */
export function ActiveSessionContent({ sessionId }: { sessionId: string }) {
  const {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
  } = useActiveSessionChat(sessionId);

  const activeSession = useStore(agentStore, (state) => state.getSession(sessionId));
  const pendingHumanInTheLoopRequest = useStore(
    agentStore,
    (state) => state.getHumanInTheLoopState(sessionId).requests[0] ?? null,
  );
  const sessionName = activeSession?.name.trim() || "untitled";
  const { createSession, selectSession } = useAgentSession();
  const handleCreate = useCallback(() => {
    void createSession();
  }, [createSession]);
  const handleSelect = useCallback(
    (nextSessionId: string) => {
      void selectSession(nextSessionId);
    },
    [selectSession],
  );

  useAgentMessages();
  useAgentTokenUsage();

  const handlePromptInputCreated: PromptInputProps["onCreate"] = () => {};
  const handlePromptInputDestroyed: PromptInputProps["onDestroy"] = () => {};

  return (
    <PanelLayout>
      <PanelHeader
        actions={
          <SessionActions
            activeSessionId={sessionId}
            onCreate={handleCreate}
            onSelect={handleSelect}
          />
        }
        isRunning={isRunning}
        subtitle={isRunning ? "Investigating" : "Traceability Agent"}
        title={sessionName}
      />

      <PanelBody className="overflow-hidden">
        <ChatMessages
          entries={entries}
          isRunning={isRunning}
          messageEntries={messageEntries}
          sessionId={sessionId}
          streamingEntryId={streamingEntryId}
          toolStates={toolStates}
        />
      </PanelBody>

      <PanelFooter>
        <div className="mx-auto w-full max-w-[720px]">
          <PendingMessages sessionId={sessionId} />
          {pendingHumanInTheLoopRequest ? (
            <AskUserQuestionPanel request={pendingHumanInTheLoopRequest} sessionId={sessionId} />
          ) : (
            <PromptInput
              disabled={false}
              initialModel={activeSession?.model ?? null}
              isRunning={isRunning}
              onFollowUp={followUpPrompt}
              onSteer={steerPrompt}
              onStop={stopPrompt}
              onSubmit={submitPrompt}
              onCreate={handlePromptInputCreated}
              onDestroy={handlePromptInputDestroyed}
            />
          )}
        </div>
      </PanelFooter>
    </PanelLayout>
  );
}

// ─── Session controls ─────────────────────────────────────────────────

interface SessionActionsProps {
  activeSessionId: string;
  onCreate: () => void;
  onSelect: (sessionId: string) => void;
}

function SessionActions({ activeSessionId, onCreate, onSelect }: SessionActionsProps) {
  useRegisterCommands(
    () => [
      {
        id: "agent.new-session",
        group: { id: "agent", label: "Agent", order: 40 },
        title: "New conversation",
        description: "Start an agent session for this project",
        icon: SquarePen,
        shortcut: "⌘ N",
        action: () => {
          onCreate();
          toast("New conversation started");
        },
      },
      {
        id: "agent.switch-session",
        group: { id: "agent", label: "Agent", order: 40 },
        title: "Switch conversation",
        description: "Choose an existing agent session",
        icon: MessagesSquare,
        shortcut: "⌘ G",
        closeOnSelect: false,
        action: () => openCommandPalette("sessions"),
      },
    ],
    [onCreate],
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <SessionSwitcher activeSessionId={activeSessionId} onSelect={onSelect} />
      <button
        aria-label="New conversation"
        className="grid size-7 place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/[0.07] hover:text-ink"
        onClick={onCreate}
        title="New conversation"
        type="button"
      >
        <SquarePen size={15} />
      </button>
    </div>
  );
}

interface SessionSwitcherProps {
  activeSessionId: string;
  onSelect: (sessionId: string) => void;
}

function SessionSwitcher({ activeSessionId, onSelect }: SessionSwitcherProps) {
  const [open, setOpen] = useState(false);
  const sessions = useStore(agentStore, (state) => state.sessions);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Switch conversation"
        className="grid size-7 place-items-center rounded-[7px] text-tertiary transition-colors hover:bg-white/[0.07] hover:text-ink"
        onClick={() => setOpen((current) => !current)}
        title="Switch conversation"
        type="button"
      >
        <MessagesSquare size={15} />
      </button>
      {open ? (
        <SessionMenu
          activeSessionId={activeSessionId}
          onClose={() => setOpen(false)}
          onSelect={onSelect}
          sessions={sessions}
        />
      ) : null}
    </div>
  );
}

interface SessionMenuProps {
  activeSessionId: string;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
  sessions: AgentSession[];
}

function SessionMenu({ activeSessionId, onClose, onSelect, sessions }: SessionMenuProps) {
  return (
    <>
      <button
        aria-label="Close conversation switcher"
        className="fixed inset-0 z-30 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Conversations"
        className="absolute top-[calc(100%+8px)] right-0 z-40 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-[10px] border border-hairline-strong bg-[rgba(30,31,37,0.98)] shadow-[0_18px_50px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
        role="menu"
      >
        <div className="border-b border-hairline px-2.5 py-2 text-[10px] font-[650] uppercase tracking-[0.07em] text-tertiary">
          Switch conversation
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {sessions.length === 0 ? (
            <p className="px-2 py-4 text-center text-[10px] text-tertiary">No conversations yet.</p>
          ) : null}
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            const className = active
              ? "grid w-full grid-cols-[18px_minmax(0,1fr)_16px] items-center gap-2 rounded-[7px] bg-white/[0.075] px-2 py-2 text-left text-[11px] text-ink transition-colors"
              : "grid w-full grid-cols-[18px_minmax(0,1fr)_16px] items-center gap-2 rounded-[7px] px-2 py-2 text-left text-[11px] text-muted transition-colors hover:bg-white/[0.06] hover:text-ink";

            return (
              <button
                key={session.id}
                className={className}
                onClick={() => {
                  onSelect(session.id);
                  onClose();
                }}
                role="menuitem"
                type="button"
              >
                <MessageCircle
                  className={active ? "text-primary-hover" : "text-tertiary"}
                  size={13}
                />
                <span className="truncate font-[610]">{session.name || "New conversation"}</span>
                {active ? <Check className="text-primary-hover" size={13} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── useAgentSession ──────────────────────────────────────────────────

const AGENT_PROJECT_ID = "traceability";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useAgentSession() {
  const { invoke } = useElectronIPC();
  const activationVersionRef = useRef(0);
  const [, setError] = useState<string | null>(null);

  const activateSession = useCallback(
    async (session: Session): Promise<boolean> => {
      if (session.projectId !== AGENT_PROJECT_ID) {
        setError("This conversation belongs to a different project.");
        return false;
      }

      const activationVersion = ++activationVersionRef.current;
      setError(null);

      try {
        const entries = await invoke("getBranch", session.id);
        if (activationVersion !== activationVersionRef.current) return false;

        const sessionEntries = entries.map(toSessionEntry);
        const existingEntries = agentStore.getState().getEntryState(session.id).entries;
        const persistedIds = new Set(sessionEntries.map((entry) => entry.id));
        const unsyncedEntries = existingEntries.filter(
          (entry) => entry.status !== EntryStatus.Synced && !persistedIds.has(entry.id),
        );
        const hydratedEntries = [...sessionEntries, ...unsyncedEntries];
        agentStore.getState().setSessionEntries(session.id, hydratedEntries);

        await invoke("setSessionId", session.id);
        await invoke("setSessionScope", session.id, "main");
        await invoke(
          "setHistoryMessages",
          session.id,
          hydratedEntries.filter(isMessageEntry).map((entry) => entry.data) as AgentMessage[],
        );
        if (activationVersion !== activationVersionRef.current) return false;

        const selectedModel = getSelectedModel(hydratedEntries);
        if (selectedModel) agentStore.getState().setModel(session.id, selectedModel);
        agentStore.getState().setActiveSessionId(session.id);
        return true;
      } catch (cause) {
        if (activationVersion === activationVersionRef.current) setError(toErrorMessage(cause));
        return false;
      }
    },
    [invoke],
  );

  const selectSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const known = agentStore.getState().getSession(sessionId);
      const session = known ?? (await invoke("getSession", sessionId));
      if (!session) {
        setError("Conversation not found.");
        return false;
      }
      return activateSession(session);
    },
    [activateSession, invoke],
  );

  const createSession = useCallback(async (): Promise<AgentSession | null> => {
    try {
      setError(null);
      const session = await invoke("createSession", AGENT_PROJECT_ID);
      agentStore.getState().appendSession(session);
      const activated = await activateSession(session);
      return activated ? (agentStore.getState().getSession(session.id) ?? null) : null;
    } catch (cause) {
      setError(toErrorMessage(cause));
      return null;
    }
  }, [activateSession, invoke]);

  const refreshSessions = useCallback(async (): Promise<Session[]> => {
    const sessions = await invoke("listSessions", AGENT_PROJECT_ID);
    const persistedIds = new Set(sessions.map((session) => session.id));
    const optimisticSessions = agentStore
      .getState()
      .sessions.filter(
        (session) => session.projectId === AGENT_PROJECT_ID && !persistedIds.has(session.id),
      );
    const nextSessions = [...sessions, ...optimisticSessions];
    agentStore.getState().setSessions(nextSessions);
    return nextSessions;
  }, [invoke]);

  useEffect(() => {
    let cancelled = false;
    void refreshSessions().catch((cause) => {
      if (!cancelled) setError(toErrorMessage(cause));
    });

    return () => {
      cancelled = true;
      activationVersionRef.current += 1;
    };
  }, [refreshSessions]);

  return { createSession, selectSession };
}

// ─── useActiveSessionChat ────────────────────────────────────────────

function useActiveSessionChat(activeSessionId: string) {
  const { invoke } = useElectronIPC();
  const activeSession = useStore(agentStore, (state) => state.getSession(activeSessionId));
  const entryState = useStore(agentStore, (state) => state.getEntryState(activeSessionId));
  const streamingEntryId = useStore(agentStore, (state) =>
    state.streamingEntryIds.get(activeSessionId),
  );
  const entries = entryState.entries;
  const messageEntries = entries.filter(isMessageEntry);
  const toolStates = entryState.toolStates;
  const isRunning = entryState.status === "running";

  const submitPrompt = useCallback(
    async (submission: PromptSubmission) => {
      agentStore.getState().setSessionStatus(activeSessionId, "running");
      agentStore.getState().setModel(activeSessionId, submission.model);
      const submissionText = submission.content;
      const shouldRename =
        shouldAutoRenameSession(activeSession?.name) &&
        !entries.some((entry) => isMessageEntry(entry) && isUserMessage(entry.data));

      if (shouldRename) {
        const title = createSessionTitleFromPrompt(submissionText);
        agentStore.getState().setSessionName(activeSessionId, title);
        try {
          await invoke("renameSession", activeSessionId, title);
        } catch (error) {
          console.error("Failed to rename session", error);
        }
      }

      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submissionText,
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
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to submit prompt", error);
        agentStore.getState().setSessionStatus(activeSessionId, "idle");
      }
    },
    [activeSession?.name, activeSessionId, entries, invoke],
  );

  const steerPrompt = useCallback(
    async (submission: PromptSubmission) => {
      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "steering",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        agentStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to steer prompt", error);
        agentStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
      }
    },
    [activeSessionId, invoke],
  );

  const followUpPrompt = useCallback(
    async (submission: PromptSubmission) => {
      const timestamp = Date.now();
      try {
        const appUserMessage: AppUserMessage = {
          role: "user",
          content: submission.content,
          timestamp,
          kind: "follow-up",
          jsonContent: submission.jsonContent,
          metadata: {
            model: {
              modelId: submission.model.modelId,
              providerId: submission.model.providerId,
            },
            skillIds: submission.skillIds,
          },
        };
        agentStore.getState().addPendingMessage(activeSessionId, appUserMessage);
        await invoke("prompt", activeSessionId, appUserMessage);
      } catch (error) {
        console.error("Failed to queue follow-up prompt", error);
        agentStore.getState().removePendingMessageByTimestamp(activeSessionId, timestamp);
      }
    },
    [activeSessionId, invoke],
  );

  const stopPrompt = useCallback(async () => {
    try {
      await invoke("abortPrompt", activeSessionId);
    } catch (error) {
      console.error("Failed to stop prompt", error);
    }
  }, [activeSessionId, invoke]);

  return {
    entries,
    isRunning,
    messageEntries,
    streamingEntryId,
    stopPrompt,
    toolStates,
    submitPrompt,
    steerPrompt,
    followUpPrompt,
  };
}
