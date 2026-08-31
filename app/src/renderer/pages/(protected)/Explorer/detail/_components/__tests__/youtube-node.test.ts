import { describe, expect, it } from "vitest";

import type { YoutubeNodeData } from "../../../types";
import { getNodeDescription, getNodeMeta, getNodeTitle, nodeIcon } from "../ExplorerGraphNodeCard";

describe("Explorer YouTube Node Helpers & Card Display", () => {
  it("returns ▶ icon for youtube node type", () => {
    expect(nodeIcon("youtube")).toBe("▶");
  });

  it("extracts title correctly from youtube data", () => {
    const withTitle: YoutubeNodeData = {
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Checkout Bug Video",
    };
    expect(getNodeTitle(withTitle)).toBe("Checkout Bug Video");

    const withoutTitle: YoutubeNodeData = {
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
    };
    expect(getNodeTitle(withoutTitle)).toBe("YouTube (dQw4w9WgXcQ)");
  });

  it("extracts description correctly from youtube data", () => {
    const withTranscript: YoutubeNodeData = {
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      transcriptExcerpt: "User clicked pay button and received 409",
    };
    expect(getNodeDescription(withTranscript)).toBe("User clicked pay button and received 409");

    const withUrlOnly: YoutubeNodeData = {
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    expect(getNodeDescription(withUrlOnly)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("formats metadata with duration for youtube node", () => {
    const withDuration: YoutubeNodeData = {
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      duration: 270, // 04:30
    };
    expect(getNodeMeta(withDuration)).toBe("04:30");

    const withoutDuration: YoutubeNodeData = {
      kind: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    expect(getNodeMeta(withoutDuration)).toBe("Video");
  });
});
