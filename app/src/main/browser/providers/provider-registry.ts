import type { BrowserProvider, BrowserSource, ProjectionRule } from "../types.js";

export interface BrowserProviderAdapter {
  provider: BrowserProvider;
  matches(url: URL): boolean;
  canonicalize(url: URL): BrowserSource;
  isAllowedNavigation(from: URL, to: URL, phase: "bootstrap" | "locked"): boolean;
  providerPreset(): ProjectionRule[];
  getInjectedStyles?(): string;
}

export class ProviderRegistry {
  private adapters: BrowserProviderAdapter[] = [];

  register(adapter: BrowserProviderAdapter): void {
    this.adapters.push(adapter);
  }

  resolve(urlStr: string): BrowserProviderAdapter {
    try {
      const url = new URL(urlStr);
      for (const adapter of this.adapters) {
        if (adapter.matches(url)) {
          return adapter;
        }
      }
    } catch {
      // invalid url fallback
    }
    // Default to generic-web
    const fallback = this.adapters.find((a) => a.provider === "generic-web");
    if (!fallback) {
      throw new Error("No generic-web provider adapter registered.");
    }
    return fallback;
  }
}
