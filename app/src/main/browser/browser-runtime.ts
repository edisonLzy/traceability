import type { WebContents } from "electron";

import { getGuestBridgeScript } from "./guest-bridge-script.js";
import { NavigationPolicy } from "./navigation-policy.js";
import type { BrowserProviderAdapter } from "./providers/provider-registry.js";
import type {
  BrowserAnchor,
  BrowserBounds,
  BrowserLocator,
  BrowserMode,
  BrowserProjection,
  BrowserResolution,
  BrowserRuntimeState,
  BrowserSource,
  BrowserViewState,
  ProjectionRule,
} from "./types.js";

export interface BrowserRuntimeCallbacks {
  onAnchorSelected?: (quote: string, locators: BrowserLocator[]) => void;
  onElementZapped?: (locators: BrowserLocator[], suggestedName?: string) => void;
  onResolutions?: (
    anchors: Record<string, BrowserResolution>,
    rules: Record<string, BrowserResolution>,
  ) => void;
  onStateChanged?: (state: BrowserRuntimeState, title?: string, url?: string) => void;
}

export class BrowserRuntime {
  readonly nodeId: string;
  readonly graphId: string;
  readonly source: BrowserSource;

  private webContents: WebContents | null = null;
  private state: BrowserRuntimeState = "dormant";
  private mode: BrowserMode = "read";
  private activeProjectionRules: ProjectionRule[] = [];
  private projectionRevealed = false;
  private currentAnchors: BrowserAnchor[] = [];
  private lastViewState: BrowserViewState = {};
  private cleanupGuestListeners: (() => void) | null = null;

  constructor(
    nodeId: string,
    graphId: string,
    source: BrowserSource,
    private adapter: BrowserProviderAdapter,
    private callbacks: BrowserRuntimeCallbacks = {},
  ) {
    this.nodeId = nodeId;
    this.graphId = graphId;
    this.source = source;
  }

  getState(): BrowserRuntimeState {
    return this.state;
  }

  getWebContents(): WebContents | null {
    return this.webContents;
  }

  getLastViewState(): BrowserViewState {
    return this.lastViewState;
  }

  async bindGuest(
    webContents: WebContents,
    initialProjection?: BrowserProjection,
    initialViewState?: BrowserViewState,
    mode?: BrowserMode,
  ): Promise<void> {
    if (this.cleanupGuestListeners) {
      this.cleanupGuestListeners();
      this.cleanupGuestListeners = null;
    }

    this.webContents = webContents;
    if (initialViewState) {
      this.lastViewState = { ...this.lastViewState, ...initialViewState };
    }
    if (mode) {
      this.mode = mode;
    }
    this.activeProjectionRules = [
      ...this.adapter.providerPreset(),
      ...(initialProjection?.rules || []),
    ];

    this.setState("loading");

    // Configure security & navigation
    NavigationPolicy.configureWebContents(webContents, this.adapter, this.source.url);

    webContents.setWindowOpenHandler(() => {
      return { action: "deny" };
    });

    webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });

    const onDidFinishLoad = () => {
      if (!this.webContents || this.webContents.isDestroyed()) return;
      this.setState("active", this.webContents.getTitle(), this.webContents.getURL());
      void this.applyCurrentProjection();
      void this.injectGuestHelperScripts();
      if (this.lastViewState.focusedAnchorId) {
        this.focusAnchor(this.lastViewState.focusedAnchorId);
      }
    };

    const onDidFailLoad = () => {
      this.setState("active");
    };

    const onIpcMessage = (_event: Electron.Event, channel: string, ...args: unknown[]) => {
      const payload = args[0] as {
        quote?: string;
        locators?: BrowserLocator[];
        suggestedName?: string;
      };
      if (channel === "__tr_selection__" && payload?.quote && payload?.locators) {
        this.callbacks.onAnchorSelected?.(payload.quote, payload.locators);
      } else if (channel === "__tr_zap_element__" && payload?.locators) {
        this.callbacks.onElementZapped?.(payload.locators, payload.suggestedName);
      }
    };

    webContents.on("did-finish-load", onDidFinishLoad);
    webContents.on("did-fail-load", onDidFailLoad);
    webContents.on("ipc-message", onIpcMessage);

    this.cleanupGuestListeners = () => {
      if (!webContents.isDestroyed()) {
        webContents.removeListener("did-finish-load", onDidFinishLoad);
        webContents.removeListener("did-fail-load", onDidFailLoad);
        webContents.removeListener("ipc-message", onIpcMessage);
      }
    };

    // If already loaded
    if (!webContents.isLoading()) {
      onDidFinishLoad();
    }
  }

  // Backward compatible init
  async init(
    _bounds?: BrowserBounds,
    initialProjection?: BrowserProjection,
    initialViewState?: BrowserViewState,
  ): Promise<void> {
    this.lastViewState = initialViewState || {};
    this.activeProjectionRules = [
      ...this.adapter.providerPreset(),
      ...(initialProjection?.rules || []),
    ];
  }

  // Backward compatible attach/detach/updateBounds
  attach(_browserWindow?: unknown, _bounds?: BrowserBounds): void {
    this.setState("active");
  }

  updateBounds(_bounds?: BrowserBounds): void {
    // No-op under <webview> architecture
  }

  detach(_browserWindow?: unknown, viewState?: BrowserViewState): void {
    if (viewState) {
      this.lastViewState = { ...this.lastViewState, ...viewState };
    }
    this.setState("warm");
  }

  setMode(mode: BrowserMode): void {
    this.mode = mode;
    if (!this.webContents || this.webContents.isDestroyed()) return;

    void this.webContents
      .executeJavaScript(`
      window.__TR_BROWSER_MODE__ = ${JSON.stringify(mode)};
      if (window.__tr_update_mode) window.__tr_update_mode(${JSON.stringify(mode)});
    `)
      .catch(() => {});
  }

  applyProjection(rules: ProjectionRule[], revealed = false): void {
    this.activeProjectionRules = rules;
    this.projectionRevealed = revealed;
    void this.applyCurrentProjection();
  }

  focusAnchor(anchorId: string, locators?: BrowserLocator[]): void {
    this.lastViewState.focusedAnchorId = anchorId;
    if (!this.webContents || this.webContents.isDestroyed()) return;

    const locatorsJson = JSON.stringify(locators || []);
    void this.webContents
      .executeJavaScript(`
      if (window.__tr_focus_anchor) {
        window.__tr_focus_anchor(${JSON.stringify(anchorId)}, ${locatorsJson});
      }
    `)
      .catch(() => {});
  }

  reload(): void {
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.reload();
    }
  }

  destroy(): void {
    this.setState("destroyed");
    if (this.cleanupGuestListeners) {
      this.cleanupGuestListeners();
      this.cleanupGuestListeners = null;
    }
    this.webContents = null;
  }

  private setState(state: BrowserRuntimeState, title?: string, url?: string): void {
    this.state = state;
    this.callbacks.onStateChanged?.(state, title, url);
  }

  private async applyCurrentProjection(): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) return;

    const hideSelectors: string[] = [];
    if (!this.projectionRevealed) {
      for (const rule of this.activeProjectionRules) {
        if (rule.enabled !== false && rule.target?.selector) {
          hideSelectors.push(rule.target.selector);
        }
      }
    }

    const css =
      hideSelectors.length > 0 ? `${hideSelectors.join(", ")} { display: none !important; }` : "";

    try {
      await this.webContents.insertCSS(css);
    } catch {
      // ignore
    }
  }

  private async injectGuestHelperScripts(): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) return;

    try {
      await this.webContents.executeJavaScript(getGuestBridgeScript());
      if (this.mode) {
        this.setMode(this.mode);
      }
    } catch {
      // ignore
    }
  }
}
