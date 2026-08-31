import type { BrowserProvider, BrowserSource, ProjectionRule } from "../types.js";
import type { BrowserProviderAdapter } from "./provider-registry.js";

export class FeishuDocAdapter implements BrowserProviderAdapter {
  readonly provider: BrowserProvider = "feishu-doc";

  matches(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host.includes("feishu.cn") || host.includes("larksuite.com");
  }

  canonicalize(url: URL): BrowserSource {
    const cleanUrl = new URL(url.toString());
    const pathParts = cleanUrl.pathname.split("/").filter(Boolean);
    const documentId = pathParts[pathParts.length - 1] || "document";

    return {
      provider: this.provider,
      url: url.toString(),
      canonicalUrl: `${url.hostname}${url.pathname}`,
      documentId,
      siteName: "Feishu Doc",
      profileId: "feishu-work",
    };
  }

  isAllowedNavigation(from: URL, to: URL, phase: "bootstrap" | "locked"): boolean {
    if (phase === "bootstrap") return true;
    // Allow Feishu passport login redirect and same doc navigation
    if (
      to.hostname.includes("passport.feishu.cn") ||
      to.hostname.includes("passport.larksuite.com")
    ) {
      return true;
    }
    return from.origin === to.origin && from.pathname === to.pathname;
  }

  providerPreset(): ProjectionRule[] {
    return [
      {
        id: "feishu-sidebar",
        operation: "hide",
        name: "Hide left navigation",
        target: {
          elementRole: "feishu.sidebar",
          selector: ".doc-left-sidebar, .catalog-tree, aside.wiki-catalog",
          locators: [{ type: "provider-element", provider: "feishu-doc", role: "sidebar" }],
        },
        enabled: true,
        origin: "provider-preset",
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
      {
        id: "feishu-comments",
        operation: "hide",
        name: "Hide comments panel",
        target: {
          elementRole: "feishu.comments",
          selector: ".comment-dock, .doc-comment-panel, .comments-container",
          locators: [{ type: "provider-element", provider: "feishu-doc", role: "comments" }],
        },
        enabled: true,
        origin: "provider-preset",
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
    ];
  }
}
