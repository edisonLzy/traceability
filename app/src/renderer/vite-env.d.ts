/// <reference types="vite/client" />

type AgentRuntimeIPC = import("../shared/events-ipc").AgentRuntimeIPC;
type AllowedMainExposeEvents = import("../shared/events-ipc").AllowedMainExposeEvents;
type InvokeArgs<C extends keyof AgentRuntimeIPC> = Parameters<AgentRuntimeIPC[C]>;

interface ElectronAPI {
  invoke<C extends keyof AgentRuntimeIPC>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<AgentRuntimeIPC[C]>>>;
  on<E extends keyof AllowedMainExposeEvents>(
    event: E,
    callback: (data: AllowedMainExposeEvents[E]) => void,
  ): () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

declare module "*.lottie" {
  const source: string;
  export default source;
}
