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

interface BrowserRuntimeAPI {
  attach(input: unknown): Promise<{ success: boolean }>;
  updateBounds(input: unknown): Promise<{ success: boolean }>;
  detach(input: unknown): Promise<{ success: boolean }>;
  setMode(input: unknown): Promise<{ success: boolean }>;
  applyProjection(input: unknown): Promise<{ success: boolean }>;
  focusAnchor(input: unknown): Promise<{ success: boolean }>;
  reload(nodeId: string): Promise<{ success: boolean }>;
  on(event: string, callback: (...args: unknown[]) => void): () => void;
}

interface Window {
  electronAPI: ElectronAPI;
  browserRuntimeAPI?: BrowserRuntimeAPI;
}

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

declare module "*.lottie" {
  const source: string;
  export default source;
}
