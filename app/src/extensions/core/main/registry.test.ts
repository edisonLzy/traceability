import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAssistantBlock } from "../../../shared/assistant-block.js";
import { MainExtensionRegistry } from "./registry.js";

describe("MainExtensionRegistry assistant blocks", () => {
  it("stores definitions and rejects duplicate component types", () => {
    const registry = new MainExtensionRegistry();
    const definition = defineAssistantBlock({
      type: "issues.list",
      description: "Display issues",
      propsSchema: z.object({}),
    });

    registry.registerAssistantBlock(definition);

    expect(registry.getAssistantBlockDefinitions()).toEqual([definition]);
    expect(() => registry.registerAssistantBlock(definition)).toThrow(
      "Duplicate assistant block type: issues.list",
    );
  });
});
