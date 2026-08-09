import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONTENT_SHARE,
  INITIAL_APP_LAYOUT_STATE,
  MAX_CONTENT_SHARE,
  MIN_CONTENT_SHARE,
  appLayoutReducer,
  getAppPanelLayout,
} from "./useAppLayout";

describe("app layout", () => {
  it("starts at an even split and clamps persisted resize values to safe boundaries", () => {
    expect(INITIAL_APP_LAYOUT_STATE.contentShare).toBe(DEFAULT_CONTENT_SHARE);
    expect(
      appLayoutReducer(INITIAL_APP_LAYOUT_STATE, {
        type: "resize",
        contentShare: -100,
      }).contentShare,
    ).toBe(MIN_CONTENT_SHARE);
    expect(
      appLayoutReducer(INITIAL_APP_LAYOUT_STATE, {
        type: "resize",
        contentShare: 120,
      }).contentShare,
    ).toBe(MAX_CONTENT_SHARE);
  });

  it("restores the split ratio after focusing either panel", () => {
    const resized = appLayoutReducer(INITIAL_APP_LAYOUT_STATE, {
      type: "resize",
      contentShare: 62.5,
    });
    const focusedContent = appLayoutReducer(resized, { type: "focus-content" });
    const withFloatingAgent = appLayoutReducer(focusedContent, {
      type: "set-floating-agent-open",
      open: true,
    });
    const focusedAgent = appLayoutReducer(withFloatingAgent, { type: "focus-agent" });
    const restored = appLayoutReducer(focusedAgent, { type: "restore-split" });

    expect(getAppPanelLayout(focusedContent)).toEqual({ content: 100, agent: 0 });
    expect(getAppPanelLayout(focusedAgent)).toEqual({ content: 0, agent: 100 });
    expect(restored.contentShare).toBe(62.5);
    expect(restored.mode).toBe("split");
    expect(restored.isFloatingAgentOpen).toBe(false);
    expect(getAppPanelLayout(restored)).toEqual({ content: 62.5, agent: 37.5 });
  });

  it("only opens the floating Agent while content is focused", () => {
    const ignored = appLayoutReducer(INITIAL_APP_LAYOUT_STATE, {
      type: "set-floating-agent-open",
      open: true,
    });
    const focused = appLayoutReducer(ignored, { type: "focus-content" });
    const opened = appLayoutReducer(focused, {
      type: "set-floating-agent-open",
      open: true,
    });

    expect(ignored.isFloatingAgentOpen).toBe(false);
    expect(opened.isFloatingAgentOpen).toBe(true);
  });
});
