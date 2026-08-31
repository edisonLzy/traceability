import type { BrowserProvider, BrowserSource, ProjectionRule } from "../types.js";
import type { BrowserProviderAdapter } from "./provider-registry.js";

export class GenericWebAdapter implements BrowserProviderAdapter {
  readonly provider: BrowserProvider = "generic-web";

  matches(_url: URL): boolean {
    return true;
  }

  canonicalize(url: URL): BrowserSource {
    const cleanUrl = new URL(url.toString());
    // Strip common tracking query params
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];
    for (const p of trackingParams) {
      cleanUrl.searchParams.delete(p);
    }

    return {
      provider: this.provider,
      url: url.toString(),
      canonicalUrl: cleanUrl.toString(),
      siteName: url.hostname,
      profileId: "default",
    };
  }

  isAllowedNavigation(from: URL, to: URL, phase: "bootstrap" | "locked"): boolean {
    if (phase === "bootstrap") return true;
    // In locked phase, only allow same-origin or hash navigations
    return from.origin === to.origin;
  }

  providerPreset(): ProjectionRule[] {
    return [];
  }
}
