import type { BrowserWindow } from "electron";

import { BrowserRuntime } from "./browser-runtime.js";
import { ConfluenceAdapter } from "./providers/confluence.js";
import { FeishuDocAdapter } from "./providers/feishu-doc.js";
import { GenericWebAdapter } from "./providers/generic-web.js";
import { ProviderRegistry } from "./providers/provider-registry.js";
import type {
  BrowserBounds,
  BrowserLocator,
  BrowserMode,
  BrowserRuntimeAttachInput,
  BrowserRuntimeEventMap,
  BrowserViewState,
  ProjectionRule,
} from "./types.js";

export class BrowserRuntimeManager {
  readonly maxActive = 1;
  readonly maxWarm = 2;

  private registry = new ProviderRegistry();
  private activeRuntime: BrowserRuntime | null = null;
  private warmRuntimes = new Map<string, BrowserRuntime>();
  private allRuntimes = new Map<string, BrowserRuntime>();

  constructor(private getBrowserWindow: () => BrowserWindow | null) {
    this.registry.register(new FeishuDocAdapter());
    this.registry.register(new ConfluenceAdapter());
    this.registry.register(new GenericWebAdapter());
  }

  async acquire(input: BrowserRuntimeAttachInput): Promise<BrowserRuntime> {
    const browserWindow = this.getBrowserWindow();
    if (!browserWindow) {
      throw new Error("No active BrowserWindow available for BrowserRuntime.");
    }

    // If another runtime is active and it's not the requested node, detach it to warm
    if (this.activeRuntime && this.activeRuntime.nodeId !== input.nodeId) {
      this.detach(this.activeRuntime.nodeId);
    }

    let runtime = this.allRuntimes.get(input.nodeId);
    if (!runtime || runtime.getState() === "destroyed") {
      const adapter = this.registry.resolve(input.source.url);
      runtime = new BrowserRuntime(input.nodeId, input.graphId, input.source, adapter, {
        onStateChanged: (state, title, url) => {
          this.emitEvent("browser-runtime:stateChanged", {
            nodeId: input.nodeId,
            state,
            title,
            url,
          });
        },
        onAnchorSelected: (quote, locators) => {
          this.emitEvent("browser-runtime:anchorSelected", {
            nodeId: input.nodeId,
            quote,
            locators,
          });
        },
        onElementZapped: (locators, suggestedName) => {
          this.emitEvent("browser-runtime:elementZapped", {
            nodeId: input.nodeId,
            locators,
            suggestedName,
          });
        },
      });
      this.allRuntimes.set(input.nodeId, runtime);
      await runtime.init(input.bounds, input.projection, input.viewState);
    }

    // If it was in warm pool, remove from warm
    this.warmRuntimes.delete(input.nodeId);
    this.activeRuntime = runtime;

    runtime.attach(browserWindow, input.bounds);

    if (input.mode) {
      runtime.setMode(input.mode);
    }

    return runtime;
  }

  updateBounds(nodeId: string, bounds: BrowserBounds): void {
    const runtime = this.allRuntimes.get(nodeId);
    if (runtime && runtime === this.activeRuntime) {
      runtime.updateBounds(bounds);
    }
  }

  detach(nodeId: string, viewState?: BrowserViewState): void {
    const browserWindow = this.getBrowserWindow();
    const runtime = this.allRuntimes.get(nodeId);
    if (!runtime) return;

    if (browserWindow) {
      runtime.detach(browserWindow, viewState);
    }

    if (this.activeRuntime?.nodeId === nodeId) {
      this.activeRuntime = null;
    }

    // Add to warm pool LRU
    this.warmRuntimes.delete(nodeId);
    this.warmRuntimes.set(nodeId, runtime);

    // Evict oldest warm runtimes if exceeding maxWarm
    while (this.warmRuntimes.size > this.maxWarm) {
      const oldestNodeId = this.warmRuntimes.keys().next().value;
      if (oldestNodeId) {
        const evicted = this.warmRuntimes.get(oldestNodeId);
        this.warmRuntimes.delete(oldestNodeId);
        this.allRuntimes.delete(oldestNodeId);
        evicted?.destroy();
      }
    }
  }

  setMode(nodeId: string, mode: BrowserMode): void {
    const runtime = this.allRuntimes.get(nodeId);
    runtime?.setMode(mode);
  }

  applyProjection(nodeId: string, rules: ProjectionRule[], revealed?: boolean): void {
    const runtime = this.allRuntimes.get(nodeId);
    runtime?.applyProjection(rules, revealed);
  }

  focusAnchor(nodeId: string, anchorId: string, locators?: BrowserLocator[]): void {
    const runtime = this.allRuntimes.get(nodeId);
    runtime?.focusAnchor(anchorId, locators);
  }

  reload(nodeId: string): void {
    const runtime = this.allRuntimes.get(nodeId);
    runtime?.reload();
  }

  destroy(nodeId: string): void {
    const runtime = this.allRuntimes.get(nodeId);
    if (runtime) {
      if (this.activeRuntime === runtime) {
        this.activeRuntime = null;
      }
      this.warmRuntimes.delete(nodeId);
      this.allRuntimes.delete(nodeId);
      runtime.destroy();
    }
  }

  destroyAll(): void {
    if (this.activeRuntime) {
      this.activeRuntime.destroy();
      this.activeRuntime = null;
    }
    for (const runtime of this.allRuntimes.values()) {
      runtime.destroy();
    }
    this.warmRuntimes.clear();
    this.allRuntimes.clear();
  }

  private emitEvent<K extends keyof BrowserRuntimeEventMap>(
    eventName: K,
    payload: BrowserRuntimeEventMap[K],
  ): void {
    const bw = this.getBrowserWindow();
    if (bw && !bw.isDestroyed() && !bw.webContents.isDestroyed()) {
      bw.webContents.send(eventName, payload);
    }
  }
}
