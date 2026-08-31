import { session, WebContentsView } from "electron";
import type { BrowserWindow } from "electron";

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

  private view: WebContentsView | null = null;
  private state: BrowserRuntimeState = "dormant";
  private mode: BrowserMode = "read";
  private currentBounds: BrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
  private activeProjectionRules: ProjectionRule[] = [];
  private projectionRevealed = false;
  private currentAnchors: BrowserAnchor[] = [];
  private lastViewState: BrowserViewState = {};

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

  getView(): WebContentsView | null {
    return this.view;
  }

  getLastViewState(): BrowserViewState {
    return this.lastViewState;
  }

  async init(
    bounds: BrowserBounds,
    initialProjection?: BrowserProjection,
    initialViewState?: BrowserViewState,
  ): Promise<void> {
    this.currentBounds = bounds;
    this.lastViewState = initialViewState || {};
    this.activeProjectionRules = [
      ...this.adapter.providerPreset(),
      ...(initialProjection?.rules || []),
    ];

    this.setState("loading");

    const partition = `persist:traceability-browser-${this.source.profileId || "default"}`;
    const sess = session.fromPartition(partition);

    this.view = new WebContentsView({
      webPreferences: {
        session: sess,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });

    this.view.setBounds(bounds);

    const wc = this.view.webContents;
    NavigationPolicy.configureWebContents(wc, this.adapter, this.source.url);

    wc.on("did-finish-load", () => {
      this.setState("active", wc.getTitle(), wc.getURL());
      void this.applyCurrentProjection();
      void this.injectGuestHelperScripts();
      if (this.lastViewState.focusedAnchorId) {
        this.focusAnchor(this.lastViewState.focusedAnchorId);
      }
    });

    wc.on("did-fail-load", () => {
      this.setState("active");
    });

    try {
      await wc.loadURL(this.source.url);
    } catch {
      // ignore navigation abort or fail, did-fail-load handles state
    }
  }

  attach(browserWindow: BrowserWindow, bounds: BrowserBounds): void {
    this.currentBounds = bounds;
    if (!this.view) return;

    this.view.setBounds(bounds);
    this.view.setVisible(true);

    try {
      browserWindow.contentView.addChildView(this.view);
    } catch {
      // view might already be attached
    }

    this.setState("active");
  }

  updateBounds(bounds: BrowserBounds): void {
    this.currentBounds = bounds;
    if (this.view) {
      this.view.setBounds(bounds);
    }
  }

  detach(browserWindow: BrowserWindow, viewState?: BrowserViewState): void {
    if (viewState) {
      this.lastViewState = { ...this.lastViewState, ...viewState };
    }
    if (this.view) {
      this.view.setVisible(false);
      try {
        browserWindow.contentView.removeChildView(this.view);
      } catch {
        // ignore
      }
    }
    this.setState("warm");
  }

  setMode(mode: BrowserMode): void {
    this.mode = mode;
    if (!this.view || this.view.webContents.isDestroyed()) return;

    void this.view.webContents
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
    if (!this.view || this.view.webContents.isDestroyed()) return;

    const locatorsJson = JSON.stringify(locators || []);
    void this.view.webContents
      .executeJavaScript(`
      if (window.__tr_focus_anchor) {
        window.__tr_focus_anchor(${JSON.stringify(anchorId)}, ${locatorsJson});
      }
    `)
      .catch(() => {});
  }

  reload(): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.reload();
    }
  }

  destroy(): void {
    this.setState("destroyed");
    if (this.view) {
      try {
        if (!this.view.webContents.isDestroyed()) {
          this.view.webContents.close();
        }
      } catch {
        // ignore
      }
      this.view = null;
    }
  }

  private setState(state: BrowserRuntimeState, title?: string, url?: string): void {
    this.state = state;
    this.callbacks.onStateChanged?.(state, title, url);
  }

  private async applyCurrentProjection(): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) return;

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
      await this.view.webContents.insertCSS(css);
    } catch {
      // ignore
    }
  }

  private async injectGuestHelperScripts(): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) return;

    const script = `
      (function() {
        if (window.__TR_INJECTED__) return;
        window.__TR_INJECTED__ = true;

        window.__tr_focus_anchor = function(anchorId, locators) {
          if (!locators || locators.length === 0) return;
          for (const loc of locators) {
            if (loc.type === 'text-quote' && loc.exact) {
              const elements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, li, span, div'));
              for (const el of elements) {
                if (el.textContent && el.textContent.includes(loc.exact)) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.style.outline = '2px solid #27b9dc';
                  setTimeout(() => { el.style.outline = ''; }, 3000);
                  return;
                }
              }
            } else if (loc.type === 'css-selector' && loc.selector) {
              const el = document.querySelector(loc.selector);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
              }
            }
          }
        };
      })();
    `;

    try {
      await this.view.webContents.executeJavaScript(script);
    } catch {
      // ignore
    }
  }
}
