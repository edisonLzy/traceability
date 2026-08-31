import { describe, expect, it } from "vitest";

import {
  GRAPH_NODE_TYPES,
  graphOperationSchema,
  nodeDataSchema,
  type BrowserNodeData,
} from "../types.js";

describe("Browser Node Schema & Operations", () => {
  it("includes browser in GRAPH_NODE_TYPES", () => {
    expect(GRAPH_NODE_TYPES).toContain("browser");
  });

  it("validates a minimal browser node payload", () => {
    const minimalData: BrowserNodeData = {
      kind: "browser",
      source: {
        provider: "generic-web",
        url: "https://example.com/docs/refund-policy",
      },
    };

    const parsed = nodeDataSchema.parse(minimalData);
    expect(parsed.kind).toBe("browser");
    if (parsed.kind === "browser") {
      expect(parsed.source.url).toBe("https://example.com/docs/refund-policy");
      expect(parsed.source.provider).toBe("generic-web");
    }
  });

  it("validates a full browser node payload with anchors, projection, and viewState", () => {
    const fullData: BrowserNodeData = {
      kind: "browser",
      schemaVersion: 1,
      source: {
        provider: "feishu-doc",
        url: "https://feishu.cn/docx/refund-review-policy",
        canonicalUrl: "feishu.cn/docx/refund-review-policy",
        title: "退款时效策略 PRD",
        documentId: "refund-review-policy",
        profileId: "work",
      },
      preview: {
        title: "退款时效策略 PRD",
        excerpt: "本文档定义退款申请进入人工审核的触发条件...",
      },
      anchors: [
        {
          id: "anchor-review-window",
          label: "人工审核触发条件",
          quote: "退款申请提交后超过 24 小时…必须进入人工审核队列。",
          locators: [
            { type: "feishu-block", documentId: "refund-review-policy", blockId: "block-101" },
            { type: "text-quote", exact: "退款申请提交后超过 24 小时仍未完成自动校验时" },
            { type: "heading-path", headings: ["2. 人工审核时效"] },
          ],
          createdBy: "user",
          createdAt: "2026-08-31T10:00:00.000Z",
          updatedAt: "2026-08-31T10:00:00.000Z",
          lastResolution: {
            state: "resolved",
            locatorType: "feishu-block",
            checkedAt: "2026-08-31T10:05:00.000Z",
          },
        },
      ],
      projection: {
        providerPresetVersion: "document-clean-v3",
        rules: [
          {
            id: "sidebar",
            operation: "hide",
            name: "Hide left navigation",
            target: {
              elementRole: "feishu.sidebar",
              locators: [{ type: "provider-element", provider: "feishu-doc", role: "sidebar" }],
            },
            enabled: true,
            origin: "user",
            createdAt: "2026-08-31T10:00:00.000Z",
            updatedAt: "2026-08-31T10:00:00.000Z",
            lastResolution: {
              state: "resolved",
              checkedAt: "2026-08-31T10:05:00.000Z",
            },
          },
        ],
      },
      viewState: {
        focusedAnchorId: "anchor-review-window",
        scrollTop: 280,
      },
    };

    const parsed = nodeDataSchema.parse(fullData);
    expect(parsed.kind).toBe("browser");
    if (parsed.kind === "browser") {
      expect(parsed.anchors).toHaveLength(1);
      expect(parsed.anchors?.[0]?.label).toBe("人工审核触发条件");
      expect(parsed.projection?.rules).toHaveLength(1);
      expect(parsed.viewState?.focusedAnchorId).toBe("anchor-review-window");
    }
  });

  it("validates createNode and createEdge with anchor references", () => {
    const createNodeOp = {
      op: "createNode" as const,
      id: "browser-node-1",
      type: "browser" as const,
      position: { x: 150, y: 300 },
      data: {
        kind: "browser" as const,
        source: {
          provider: "confluence" as const,
          url: "https://wiki.corp.internal/pages/checkout-spec",
          title: "Checkout Spec",
        },
      },
    };

    const parsedNodeOp = graphOperationSchema.parse(createNodeOp);
    expect(parsedNodeOp.op).toBe("createNode");

    const createEdgeOp = {
      op: "createEdge" as const,
      id: "edge-1",
      source: "browser-node-1",
      target: "code-node-2",
      relation: "implemented_by" as const,
      sourceAnchorId: "anchor-review-window",
      targetAnchorId: "code-anchor-line-88",
    };

    const parsedEdgeOp = graphOperationSchema.parse(createEdgeOp);
    expect(parsedEdgeOp.op).toBe("createEdge");
    if (parsedEdgeOp.op === "createEdge") {
      expect(parsedEdgeOp.sourceAnchorId).toBe("anchor-review-window");
      expect(parsedEdgeOp.targetAnchorId).toBe("code-anchor-line-88");
    }
  });
});
