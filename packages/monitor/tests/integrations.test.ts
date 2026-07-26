import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { corsDiagnosticIntegration } from "../src/integrations/corsDiagnostic.js";
import { whiteScreenIntegration } from "../src/integrations/whiteScreen.js";

// captureMessage is imported from @sentry/browser inside the integration; mock it
vi.mock("@sentry/browser", () => ({
  captureMessage: vi.fn(),
}));

import { captureMessage } from "@sentry/browser";

describe("corsDiagnosticIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = "";
  });

  it("warns + reports when a cross-origin script lacks crossorigin", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const script = document.createElement("script");
    script.src = "https://other-origin.example/bundle.js";
    document.head.appendChild(script);

    const integration = corsDiagnosticIntegration();
    integration.setupOnce();

    expect(warn).toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      "cors-config-warning",
      expect.objectContaining({
        level: "warning",
      }),
    );
  });

  it("is silent for same-origin scripts", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const script = document.createElement("script");
    script.src = "/local.js";
    document.head.appendChild(script);

    corsDiagnosticIntegration().setupOnce();

    expect(warn).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe("whiteScreenIntegration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports white-screen when root has no children after stable window", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    whiteScreenIntegration({ stableWindowMs: 100, minContentNodes: 3 }).setupOnce();
    // load event triggers scheduleCheck
    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(300);

    expect(captureMessage).toHaveBeenCalledWith(
      "white-screen",
      expect.objectContaining({
        tags: { type: "white-screen" },
      }),
    );
  });
});
