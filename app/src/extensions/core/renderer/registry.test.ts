import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAssistantBlock } from "../../../shared/assistant-block";
import { RendererExtensionRegistry } from "./registry";

describe("RendererExtensionRegistry assistant blocks", () => {
  it("stores typed registrations and rejects duplicate component types", () => {
    const registry = new RendererExtensionRegistry();
    const definition = defineAssistantBlock({
      type: "projects.list",
      description: "Display projects",
      propsSchema: z.object({}),
    });
    const registration = {
      definition,
      render: () => createElement("div"),
    };

    registry.registerAssistantBlock(registration);

    expect(registry.getAssistantBlock("projects.list")).toBe(registration);
    expect(() => registry.registerAssistantBlock(registration)).toThrow(
      "Duplicate assistant block type: projects.list",
    );
  });
});
