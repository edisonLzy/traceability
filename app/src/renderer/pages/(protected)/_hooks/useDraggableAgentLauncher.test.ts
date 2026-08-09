import { describe, expect, it } from "vitest";

import { clampLauncherPosition, getSummarySide } from "./useDraggableAgentLauncher";

describe("draggable Agent launcher", () => {
  it("keeps the launcher inside its boundary", () => {
    const boundary = { width: 800, height: 600 };
    const launcher = { width: 48, height: 48 };

    expect(clampLauncherPosition({ x: -100, y: -20 }, boundary, launcher)).toEqual({
      x: 18,
      y: 18,
    });
    expect(clampLauncherPosition({ x: 900, y: 700 }, boundary, launcher)).toEqual({
      x: 734,
      y: 534,
    });
  });

  it("places the live summary on the side with more room", () => {
    expect(getSummarySide(null, 800)).toBe("left");
    expect(getSummarySide({ x: 80, y: 100 }, 800)).toBe("right");
    expect(getSummarySide({ x: 680, y: 100 }, 800)).toBe("left");
  });
});
