import { describe, expect, it } from "vitest";

import {
  GRAPH_NODE_TYPES,
  graphOperationSchema,
  nodeDataSchema,
  type YoutubeNodeData,
} from "../types.js";

describe("YouTube Node Schema & Operations", () => {
  it("includes youtube in GRAPH_NODE_TYPES", () => {
    expect(GRAPH_NODE_TYPES).toContain("youtube");
  });

  it("validates a minimal youtube node payload", () => {
    const minimalData: YoutubeNodeData = {
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };

    const parsed = nodeDataSchema.parse(minimalData);
    expect(parsed.kind).toBe("youtube");
    if (parsed.kind === "youtube") {
      expect(parsed.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    }
  });

  it("validates a full youtube node payload with bookmarks and transcript", () => {
    const fullData: YoutubeNodeData = {
      kind: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
      title: "Checkout Exception Repro",
      authorName: "QA Lab",
      duration: 270,
      startTime: 15,
      endTime: 165,
      bookmarks: [
        {
          id: "bm-1",
          time: 15,
          label: "Payment button clicked",
          description: "DOM unmounts unexpectedly",
        },
        {
          id: "bm-2",
          time: 83,
          label: "Network 409 Conflict",
        },
      ],
      transcriptExcerpt: "[00:15] Click submit button\n[01:23] Double submit triggered",
    };

    const parsed = nodeDataSchema.parse(fullData);
    expect(parsed.kind).toBe("youtube");
    if (parsed.kind === "youtube") {
      expect(parsed.bookmarks).toHaveLength(2);
      expect(parsed.bookmarks?.[0]?.time).toBe(15);
      expect(parsed.bookmarks?.[0]?.label).toBe("Payment button clicked");
      expect(parsed.duration).toBe(270);
      expect(parsed.startTime).toBe(15);
    }
  });

  it("rejects youtube node payload missing url", () => {
    const invalidData = {
      kind: "youtube",
    };

    expect(() => nodeDataSchema.parse(invalidData)).toThrow();
  });

  it("validates createNode graph operation for youtube node", () => {
    const createOp = {
      op: "createNode" as const,
      id: "yt-node-1",
      type: "youtube" as const,
      position: { x: 100, y: 200 },
      data: {
        kind: "youtube" as const,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Repro Video",
      },
    };

    const parsed = graphOperationSchema.parse(createOp);
    expect(parsed.op).toBe("createNode");
    if (parsed.op === "createNode") {
      expect(parsed.type).toBe("youtube");
      expect(parsed.data.kind).toBe("youtube");
    }
  });
});
