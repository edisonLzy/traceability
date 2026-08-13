import type { MonitoringContext } from "@renderer/store/agent";

export type { MonitoringContext } from "@renderer/store/agent";

export interface AgentPromptEvent {
  /** Context to pin before running. `source: "general"` clears any pinned object. */
  context: MonitoringContext;
  /** Prompt text to send to the agent. */
  prompt: string;
}

/** Dispatch a request for the Agent panel to pin context and run a prompt. */
export function promptAgent(detail: AgentPromptEvent): void {
  window.dispatchEvent(new CustomEvent<AgentPromptEvent>("traceability:agent-prompt", { detail }));
}

/** Pin agent context without sending a prompt. */
export function setAgentContext(context: MonitoringContext): void {
  window.dispatchEvent(
    new CustomEvent<MonitoringContext>("traceability:agent-context", { detail: context }),
  );
}

/** Open the command palette. mode "global" (⌘K) or "sessions" (⌘G). */
export function openCommandPalette(mode: "global" | "sessions" = "global"): void {
  window.dispatchEvent(new CustomEvent("traceability:command-palette", { detail: { mode } }));
}
