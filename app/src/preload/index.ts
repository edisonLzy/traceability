import "@tracerability/monitor/electron-preload";
import { contextBridge, ipcRenderer } from "electron";

import type {
  AgentRuntimeIPC,
  AllowedMainExposeEvents,
  AllowedRenderInvokeEvents,
} from "../shared/events-ipc.js";
import { ALLOWED_MAIN_EXPOSE_EVENTS, ALLOWED_RENDER_INVOKE_EVENTS } from "../shared/events-ipc.js";

type InvokeArgs<C extends keyof AgentRuntimeIPC> = Parameters<AgentRuntimeIPC[C]>;

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <C extends AllowedRenderInvokeEvents>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<AgentRuntimeIPC[C]>>> => {
    if (!(ALLOWED_RENDER_INVOKE_EVENTS as readonly string[]).includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }

    return ipcRenderer.invoke(channel, ...args) as Promise<Awaited<ReturnType<AgentRuntimeIPC[C]>>>;
  },

  on: <E extends keyof AllowedMainExposeEvents>(
    event: E,
    callback: (payload: AllowedMainExposeEvents[E]) => void,
  ) => {
    if (!(ALLOWED_MAIN_EXPOSE_EVENTS as readonly string[]).includes(event)) {
      throw new Error(`IPC event not allowed: ${event}`);
    }

    const subscription = (
      _event: Electron.IpcRendererEvent,
      payload: AllowedMainExposeEvents[E],
    ) => {
      callback(payload);
    };

    ipcRenderer.on(event, subscription);

    return () => {
      ipcRenderer.removeListener(event, subscription);
    };
  },
});

contextBridge.exposeInMainWorld("browserRuntimeAPI", {
  attach: (input: unknown) => ipcRenderer.invoke("browser-runtime:attach", input),
  updateBounds: (input: unknown) => ipcRenderer.invoke("browser-runtime:updateBounds", input),
  detach: (input: unknown) => ipcRenderer.invoke("browser-runtime:detach", input),
  setMode: (input: unknown) => ipcRenderer.invoke("browser-runtime:setMode", input),
  applyProjection: (input: unknown) => ipcRenderer.invoke("browser-runtime:applyProjection", input),
  focusAnchor: (input: unknown) => ipcRenderer.invoke("browser-runtime:focusAnchor", input),
  reload: (nodeId: string) => ipcRenderer.invoke("browser-runtime:reload", nodeId),
  on: (event: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => {
      callback(...args);
    };
    ipcRenderer.on(event, subscription);
    return () => {
      ipcRenderer.removeListener(event, subscription);
    };
  },
});

contextBridge.exposeInMainWorld("extensionsAPI", {
  invoke: (extensionId: string, method: string, args: unknown[]) => {
    return ipcRenderer.invoke(`extension:${extensionId}:${method}`, ...args);
  },
  on: (extensionId: string, event: string, listener: (...args: unknown[]) => void) => {
    const channel = `extension:${extensionId}:${event}`;
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      listener(...args);
    };
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
});
