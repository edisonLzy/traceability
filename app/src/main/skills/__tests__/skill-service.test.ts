import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { SkillService } from "../skill-service.js";

describe("SkillService", () => {
  it("discovers built-in system skills when project has no override", () => {
    // Isolate from current workspace's .agents/skills project overrides
    const service = new SkillService(tmpdir());
    const skills = service.listSkills();

    const graphCreate = skills.find((s) => s.name === "explorer-graph-create");
    expect(graphCreate).toBeDefined();
    expect(graphCreate?.scope).toBe("system");
    expect(graphCreate?.enabled).toBe(true);
    expect(graphCreate?.description).toContain("Explorer evidence graph");
  });

  it("builds system prompt containing discovered skills", () => {
    const service = new SkillService(tmpdir());
    const prompt = service.buildSystemPrompt("You are an assistant.");

    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("explorer-graph-create");
    expect(prompt).toContain("</available_skills>");
  });
});
