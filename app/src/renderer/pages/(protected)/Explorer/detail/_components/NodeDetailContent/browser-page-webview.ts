export interface BrowserPageWebview extends HTMLElement {
  src: string;
  getWebContentsId(): number;
  send(channel: string, ...args: unknown[]): void;
  addEventListener(
    type: "dom-ready",
    listener: (event: { target: BrowserPageWebview }) => void,
  ): void;
  addEventListener(
    type: "ipc-message",
    listener: (event: { channel: string; args: unknown[] }) => void,
  ): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

export interface EnsureBrowserPageWebviewInput {
  nodeId: string;
  url: string;
  partition: string;
  onDomReady?: (webContentsId: number, webview: BrowserPageWebview) => void;
  onIpcMessage?: (channel: string, payload: unknown) => void;
}

export interface EnsureBrowserPageWebviewResult {
  created: boolean;
  webview: BrowserPageWebview;
}

const REGISTRY = new Map<string, BrowserPageWebview>();
const HANDLERS = new Map<
  string,
  {
    onDomReady?: (webContentsId: number, webview: BrowserPageWebview) => void;
    onIpcMessage?: (channel: string, payload: unknown) => void;
  }
>();

export function getBrowserPageWebview(nodeId: string): BrowserPageWebview | null {
  return REGISTRY.get(nodeId) ?? null;
}

export function removeBrowserPageWebview(nodeId: string): void {
  const webview = REGISTRY.get(nodeId);
  if (webview && webview.parentElement) {
    webview.parentElement.removeChild(webview);
  }
  REGISTRY.delete(nodeId);
  HANDLERS.delete(nodeId);
}

export function ensureBrowserPageWebview(
  container: HTMLElement,
  input: EnsureBrowserPageWebviewInput,
): EnsureBrowserPageWebviewResult {
  HANDLERS.set(input.nodeId, {
    onDomReady: input.onDomReady,
    onIpcMessage: input.onIpcMessage,
  });

  const existing = REGISTRY.get(input.nodeId);
  const stale =
    !existing ||
    existing.parentElement !== container ||
    existing.getAttribute("partition") !== input.partition;

  if (existing && !stale) {
    if (existing.src !== input.url && input.url) {
      existing.src = input.url;
    }
    try {
      const webContentsId = existing.getWebContentsId();
      if (webContentsId) {
        input.onDomReady?.(webContentsId, existing);
      }
    } catch {}
    return { created: false, webview: existing };
  }

  if (existing) {
    if (existing.parentElement) existing.parentElement.removeChild(existing);
    REGISTRY.delete(input.nodeId);
  }

  const webview = document.createElement("webview") as BrowserPageWebview;
  webview.setAttribute("partition", input.partition);
  webview.setAttribute("allowpopups", "");
  webview.setAttribute(
    "webpreferences",
    "contextIsolation=true,nodeIntegration=false,sandbox=true,webSecurity=true",
  );
  webview.style.display = "flex";
  webview.style.flex = "1";
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.style.border = "none";
  webview.style.outline = "none";
  webview.style.backgroundColor = "#ffffff";

  webview.addEventListener("dom-ready", () => {
    try {
      const webContentsId = webview.getWebContentsId();
      HANDLERS.get(input.nodeId)?.onDomReady?.(webContentsId, webview);
    } catch (err) {
      console.warn("Failed to getWebContentsId from webview dom-ready:", err);
    }
  });

  webview.addEventListener("ipc-message", (event: unknown) => {
    const e = event as { channel: string; args: unknown[] };
    HANDLERS.get(input.nodeId)?.onIpcMessage?.(e.channel, e.args?.[0]);
  });

  webview.addEventListener("console-message", (event: unknown) => {
    const e = event as { message: string };
    if (e.message && e.message.startsWith("__TR_GUEST_EVENT__:")) {
      try {
        const jsonStr = e.message.slice("__TR_GUEST_EVENT__:".length);
        const parsed = JSON.parse(jsonStr) as { channel: string; data: unknown };
        HANDLERS.get(input.nodeId)?.onIpcMessage?.(parsed.channel, parsed.data);
      } catch (err) {
        console.warn("Failed to parse guest console-message:", err);
      }
    }
  });

  container.appendChild(webview);
  webview.src = input.url;
  REGISTRY.set(input.nodeId, webview);

  return { created: true, webview };
}
