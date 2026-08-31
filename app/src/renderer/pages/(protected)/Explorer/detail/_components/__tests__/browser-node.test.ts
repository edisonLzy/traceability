import { describe, expect, it } from "vitest";

import type { BrowserNodeData } from "../../../types";
import { getNodeDescription, getNodeMeta, getNodeTitle, nodeIcon } from "../ExplorerGraphNodeCard";

describe("Explorer Browser Node Helpers & Card Display", () => {
  it("returns 🌐 icon for browser node type", () => {
    expect(nodeIcon("browser")).toBe("🌐");
  });

  it("extracts title correctly from browser node data", () => {
    const withSourceTitle: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "feishu-doc",
        url: "https://feishu.cn/docx/refund-review-policy",
        title: "退款时效策略 PRD",
      },
    };
    expect(getNodeTitle(withSourceTitle)).toBe("退款时效策略 PRD");

    const withPreviewTitle: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "generic-web",
        url: "https://example.com/refund",
      },
      preview: {
        title: "Refund Documentation",
      },
    };
    expect(getNodeTitle(withPreviewTitle)).toBe("Refund Documentation");

    const withUrlOnly: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "generic-web",
        url: "https://example.com/refund",
      },
    };
    expect(getNodeTitle(withUrlOnly)).toBe("example.com");
  });

  it("extracts description correctly from browser node data", () => {
    const withExcerpt: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "feishu-doc",
        url: "https://feishu.cn/docx/refund-review-policy",
      },
      preview: {
        excerpt: "本文档定义退款申请进入人工审核的触发条件...",
      },
    };
    expect(getNodeDescription(withExcerpt)).toBe("本文档定义退款申请进入人工审核的触发条件...");

    const withUrlOnly: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "feishu-doc",
        url: "https://feishu.cn/docx/refund-review-policy",
      },
    };
    expect(getNodeDescription(withUrlOnly)).toBe("https://feishu.cn/docx/refund-review-policy");
  });

  it("formats metadata with provider and anchor counts", () => {
    const withAnchors: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "feishu-doc",
        url: "https://feishu.cn/docx/refund-review-policy",
      },
      anchors: [
        { id: "a1", label: "Anchor 1" },
        { id: "a2", label: "Anchor 2" },
      ],
    };
    expect(getNodeMeta(withAnchors)).toBe("feishu-doc · 2 anchors");

    const singleAnchor: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "confluence",
        url: "https://wiki.corp/page",
      },
      anchors: [{ id: "a1", label: "Anchor 1" }],
    };
    expect(getNodeMeta(singleAnchor)).toBe("confluence · 1 anchor");

    const noAnchors: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "generic-web",
        url: "https://example.com",
      },
    };
    expect(getNodeMeta(noAnchors)).toBe("generic-web");
  });
});
