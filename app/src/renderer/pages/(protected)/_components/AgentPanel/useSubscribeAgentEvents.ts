import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import type { AgentExposeEvents, AllowedMainExposeEvents } from "@shared/events-ipc";
import { useEffect, useRef } from "react";

export type AgentEventHandlers = {
  [K in keyof AllowedMainExposeEvents]?: (event: AllowedMainExposeEvents[K]) => void;
};

/** Agent-runtime events only (session-scoped); app-level events like theme
    changes are handled elsewhere and must not surface in the agent subscribers. */
type AgentEventPayload = AgentExposeEvents[keyof AgentExposeEvents];
type AgentEventName = Extract<keyof AgentExposeEvents, string>;

interface AgentEventSubscriptionOptions {
  shouldHandleEvent?: (event: AgentEventPayload) => boolean;
}

/** Subscribe to named AgentPool events without re-subscribing on every render. */
export function useSubscribeAgentEvents(
  handlers: AgentEventHandlers,
  options: AgentEventSubscriptionOptions = {},
): void {
  const handlersRef = useRef(handlers);
  const { on } = useElectronIPC();
  handlersRef.current = handlers;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    for (const eventName of Object.keys(handlersRef.current) as AgentEventName[]) {
      unsubscribes.push(
        on(eventName, ((payload: AgentEventPayload) => {
          if (optionsRef.current.shouldHandleEvent?.(payload) === false) return;
          handlersRef.current[eventName]?.(payload as never);
        }) as never),
      );
    }

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [on]);
}
