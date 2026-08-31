import type { BrowserProvider, BrowserSource, ProjectionRule } from "../types.js";
import type { BrowserProviderAdapter } from "./provider-registry.js";

export class ConfluenceAdapter implements BrowserProviderAdapter {
  readonly provider: BrowserProvider = "confluence";

  matches(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return host.includes("atlassian.net") || host.includes("confluence") || path.includes("/wiki/");
  }

  canonicalize(url: URL): BrowserSource {
    const pageId = url.searchParams.get("pageId") || url.pathname.split("/").pop() || "page";

    return {
      provider: this.provider,
      url: url.toString(),
      canonicalUrl: `${url.hostname}${url.pathname}`,
      documentId: pageId,
      siteName: "Confluence",
      profileId: "confluence-work",
    };
  }

  isAllowedNavigation(from: URL, to: URL, phase: "bootstrap" | "locked"): boolean {
    if (phase === "bootstrap") return true;
    if (to.hostname.includes("id.atlassian.com") || to.hostname.includes("auth.atlassian.com")) {
      return true;
    }
    return from.origin === to.origin;
  }

  providerPreset(): ProjectionRule[] {
    return [
      {
        id: "confluence-sidebar",
        operation: "hide",
        name: "Hide navigation sidebar",
        target: {
          elementRole: "confluence.sidebar",
          selector: "[data-testid='ContentNavigationSidebar'], .ia-fixed-sidebar",
          locators: [{ type: "provider-element", provider: "confluence", role: "sidebar" }],
        },
        enabled: true,
        origin: "provider-preset",
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
    ];
  }
}
