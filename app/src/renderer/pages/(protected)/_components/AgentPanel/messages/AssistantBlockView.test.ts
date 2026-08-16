// @vitest-environment jsdom

import { ExtensionProvider, defineRendererExtension } from "@extensions/core/renderer";
import { defineAssistantBlock } from "@shared/assistant-block";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AssistantBlockView } from "./AssistantBlockView";

const definition = defineAssistantBlock({
  type: "test.counter",
  description: "Test counter",
  propsSchema: z.object({ count: z.number().int().default(1) }),
});

const extension = defineRendererExtension({
  id: "test.blocks",
  name: "Test blocks",
  setup(ctx) {
    ctx.assistantBlocks.register({
      definition,
      render: ({ props }) => createElement("span", null, `Count ${props.count}`),
    });
  },
});

function render(block: { type: string; props: unknown }) {
  return renderToStaticMarkup(
    createElement(ExtensionProvider, {
      extensions: [extension],
      children: createElement(AssistantBlockView, { block }),
    }),
  );
}

describe("AssistantBlockView", () => {
  it("passes schema-parsed props with defaults to the component", () => {
    expect(render({ type: "test.counter", props: { ignored: true } })).toContain("Count 1");
  });

  it("shows validation reasons and the complete raw props collapsed", () => {
    const markup = render({
      type: "test.counter",
      props: { count: "wrong", original: "visible" },
    });

    expect(markup).toContain("Assistant component could not be rendered");
    expect(markup).toContain("Raw props");
    expect(markup).toContain("original");
    expect(markup).toContain("visible");
    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
  });

  it("renders a local failure for unknown component types", () => {
    const markup = render({ type: "unknown.block", props: { input: true } });
    expect(markup).toContain("No component is registered");
    expect(markup).toContain("unknown.block");
  });

  it("contains component exceptions in a local error card", async () => {
    const brokenExtension = defineRendererExtension({
      id: "test.broken-block",
      name: "Broken test block",
      setup(ctx) {
        ctx.assistantBlocks.register({
          definition: defineAssistantBlock({
            type: "test.broken",
            description: "Broken block",
            propsSchema: z.object({}),
          }),
          render: () => {
            throw new Error("component exploded");
          },
        });
      },
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await act(async () => {
        root.render(
          createElement(ExtensionProvider, {
            extensions: [brokenExtension],
            children: createElement(AssistantBlockView, {
              block: { type: "test.broken", props: {} },
            }),
          }),
        );
      });

      expect(container.textContent).toContain("Assistant component could not be rendered");
      expect(container.textContent).toContain("component exploded");
      expect(container.textContent).toContain("Raw props");
    } finally {
      await act(async () => root.unmount());
      consoleError.mockRestore();
    }
  });
});
