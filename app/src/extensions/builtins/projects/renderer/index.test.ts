import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock("@renderer/lib/trpc", () => ({
  trpc: {
    projects: {
      list: { useQuery: mocks.useQuery },
    },
  },
}));

import { ProjectsListBlock } from "./index";

function render() {
  return renderToStaticMarkup(
    createElement(ProjectsListBlock, {
      props: {},
      raw: "{}",
    }),
  );
}

describe("ProjectsListBlock", () => {
  beforeEach(() => mocks.useQuery.mockReset());

  it("queries current project data and renders results", () => {
    mocks.useQuery.mockReturnValue({
      data: [{ id: "project-1", name: "Traceability", slug: "traceability" }],
      error: null,
      isLoading: false,
    });

    const markup = render();

    expect(mocks.useQuery).toHaveBeenCalledWith(undefined, { staleTime: 30_000 });
    expect(markup).toContain("Traceability");
    expect(markup).toContain("traceability");
  });

  it.each([
    [{ data: undefined, error: null, isLoading: true }, "Loading projects"],
    [{ data: [], error: null, isLoading: false }, "No Traceability projects found"],
    [
      { data: [], error: new Error("offline"), isLoading: false },
      "Could not load projects: offline",
    ],
  ])("renders query state %#", (query, expected) => {
    mocks.useQuery.mockReturnValue(query);
    expect(render()).toContain(expected);
  });
});
